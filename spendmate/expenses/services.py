from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional

import requests
from bson import ObjectId
from bson.errors import InvalidId
from django.conf import settings
from django.utils import timezone
from pymongo import ReturnDocument

from spendmate.mongo import get_collection


class OCRServiceError(RuntimeError):
    pass


def get_expenses_collection():
    return get_collection(settings.MONGODB_COLLECTION)


def get_expense_goals_collection():
    name = getattr(settings, "MONGODB_GOALS_COLLECTION", "expense_goals")
    return get_collection(name)


def call_ocr_service(file_obj, filename: str) -> Dict[str, Any]:
    if not settings.OCR_SERVICE_URL:
        raise OCRServiceError("OCR_SERVICE_URL is not configured.")

    if hasattr(file_obj, "seek"):
        file_obj.seek(0)
    content_type = getattr(file_obj, "content_type", "application/octet-stream")
    files = {"file": (filename, file_obj, content_type)}
    try:
        response = requests.post(settings.OCR_SERVICE_URL, files=files, timeout=60)
    except requests.RequestException as exc:
        raise OCRServiceError(f"OCR service unreachable: {exc}") from exc

    if response.status_code != 200:
        raise OCRServiceError(f"OCR service error: {response.status_code} {response.text}")

    try:
        return response.json()
    except ValueError as exc:
        raise OCRServiceError("Failed to parse OCR response as JSON") from exc


def persist_expense(payload: Dict[str, Any], *, user_id: Optional[str] = None, notes: Optional[str] = None) -> str:
    collection = get_expenses_collection()
    stored_user_id = str(user_id) if user_id is not None else None
    engine = payload.get("debug", {}).get("engine") or "unknown"
    document = {
        "user_id": stored_user_id,
        "notes": notes,
        "parsed": payload.get("parsed"),
        "created_at": timezone.now(),
        "status": "uploaded",
        "ocr": payload,
        "ocr_engine": engine,
    }
    result = collection.insert_one(document)
    return str(result.inserted_id)


def _parse_date_string(value: Optional[str]) -> Optional[date]:
    if not value or not isinstance(value, str):
        return None
    value = value.strip()
    formats = ("%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d", "%Y%m%d", "%m/%d", "%m-%d")
    for fmt in formats:
        try:
            parsed = datetime.strptime(value, fmt)
            if fmt in {"%m/%d", "%m-%d"}:
                parsed = parsed.replace(year=datetime.utcnow().year)
            return parsed.date()
        except ValueError:
            continue
    abbreviations = {
        "jan": 1,
        "feb": 2,
        "mar": 3,
        "apr": 4,
        "may": 5,
        "jun": 6,
        "jul": 7,
        "aug": 8,
        "sep": 9,
        "oct": 10,
        "nov": 11,
        "dec": 12,
    }
    parts = value.replace('.', ' ').replace('-', ' ').split()
    if len(parts) == 2 and parts[0].lower()[:3] in abbreviations:
        try:
            month = abbreviations[parts[0].lower()[:3]]
            day = int(parts[1])
            year = datetime.utcnow().year
            return date(year, month, day)
        except ValueError:
            pass
    return None


def _selection_date(selection: Dict[str, Any]) -> Optional[datetime]:
    parsed_date = _parse_date_string(selection.get("date_text"))
    if parsed_date:
        return datetime.combine(parsed_date, time.min, tzinfo=timezone.utc if hasattr(timezone, 'utc') else timezone.get_default_timezone())
    return None


def save_user_selection(
    document_id: str,
    *,
    user_id: int,
    selection: Dict[str, Any],
) -> Dict[str, Any]:
    collection = get_expenses_collection()
    try:
        object_id = ObjectId(document_id)
    except (InvalidId, TypeError) as exc:
        raise ValueError("유효하지 않은 문서 ID 입니다.") from exc

    owner_id = str(user_id)
    selection_dt = _selection_date(selection)
    update_doc = {
        "$set": {
            "selection": selection,
            "selection_date": selection_dt,
            "status": "confirmed",
            "confirmed_at": timezone.now(),
        }
    }
    doc = collection.find_one_and_update(
        {"_id": object_id, "$or": [{"user_id": owner_id}, {"user_id": user_id}]},
        update_doc,
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise LookupError("해당 문서를 찾을 수 없습니다.")
    return doc


def _effective_date(doc: Dict[str, Any]) -> Optional[date]:
    selection = doc.get("selection", {})
    parsed = _parse_date_string(selection.get("date_text"))
    if parsed:
        return parsed
    candidate = doc.get("selection_date") or doc.get("confirmed_at") or doc.get("created_at")
    if candidate:
        if isinstance(candidate, datetime):
            return candidate.date()
        if isinstance(candidate, date):
            return candidate
        if isinstance(candidate, str):
            parsed = _parse_date_string(candidate)
            if parsed:
                return parsed
    return None


def _normalize_range(start: Optional[date], end: Optional[date]) -> tuple[date, date]:
    today = timezone.localdate()
    end_date = end or today
    start_date = start or (end_date - timedelta(days=29))
    if start_date > end_date:
        raise ValueError("조회 기간이 올바르지 않습니다.")
    return start_date, end_date


def daily_expense_report(
    user_id: str,
    *,
    start: Optional[date] = None,
    end: Optional[date] = None,
) -> Dict[str, Any]:
    start_date, end_date = _normalize_range(start, end)
    collection = get_expenses_collection()
    query = {
        "user_id": str(user_id),
        "status": "confirmed",
        "selection.amount_value": {"$ne": None},
    }
    cursor = collection.find(query)
    totals: Dict[date, float] = {}
    for doc in cursor:
        record_date = _effective_date(doc)
        if not record_date:
            continue
        if record_date < start_date or record_date > end_date:
            continue
        amount = float(doc.get("selection", {}).get("amount_value") or 0)
        totals[record_date] = totals.get(record_date, 0.0) + amount

    labels: List[str] = []
    data: List[float] = []
    running_date = start_date
    grand_total = 0.0
    while running_date <= end_date:
        value = round(totals.get(running_date, 0.0), 2)
        labels.append(running_date.isoformat())
        data.append(value)
        grand_total += value
        running_date += timedelta(days=1)

    return {
        "start": start_date.isoformat(),
        "end": end_date.isoformat(),
        "labels": labels,
        "series": [
            {
                "label": "me",
                "data": data,
            }
        ],
        "total_amount": round(grand_total, 2),
        "data_points": len(labels),
    }


def category_expense_report(
    user_id: str,
    *,
    start: Optional[date] = None,
    end: Optional[date] = None,
) -> Dict[str, Any]:
    start_date, end_date = _normalize_range(start, end)
    collection = get_expenses_collection()
    query = {
        "user_id": str(user_id),
        "status": "confirmed",
        "selection.amount_value": {"$ne": None},
    }
    buckets: Dict[str, Dict[str, float | int]] = {}
    for doc in collection.find(query):
        record_date = _effective_date(doc)
        if not record_date:
            continue
        if record_date < start_date or record_date > end_date:
            continue
        selection = doc.get("selection", {})
        amount = float(selection.get("amount_value") or 0)
        if amount <= 0:
            continue
        category = (selection.get("category") or "").strip() or "미분류"
        entry = buckets.setdefault(category, {"total": 0.0, "count": 0})
        entry["total"] = float(entry["total"]) + amount
        entry["count"] = int(entry["count"]) + 1

    categories = [
        {
            "label": label,
            "total": round(values["total"], 2),
            "count": values["count"],
        }
        for label, values in buckets.items()
    ]
    categories.sort(key=lambda item: item["total"], reverse=True)
    total_amount = round(sum(item["total"] for item in categories), 2)

    return {
        "start": start_date.isoformat(),
        "end": end_date.isoformat(),
        "categories": categories,
        "total_amount": total_amount,
        "category_count": len(categories),
    }


def latest_expense_document(user_id: str):
    collection = get_expenses_collection()
    doc = collection.find_one(
        {"user_id": str(user_id)},
        sort=[("confirmed_at", -1), ("created_at", -1)],
    )
    return doc


def list_expense_documents(limit=50):
    collection = get_expenses_collection()
    cursor = collection.find().sort("created_at", -1).limit(limit)
    return list(cursor)


def delete_expense_document(document_id: str) -> bool:
    collection = get_expenses_collection()
    try:
        object_id = ObjectId(document_id)
    except (InvalidId, TypeError) as exc:
        raise ValueError("유효하지 않은 문서 ID 입니다.") from exc
    result = collection.delete_one({"_id": object_id})
    return result.deleted_count > 0


def _month_key(from_date: date) -> str:
    return f"{from_date.year}-{from_date.month:02d}"


def _shift_month(month_start: date, delta: int) -> date:
    year = month_start.year + (month_start.month - 1 + delta) // 12
    month = (month_start.month - 1 + delta) % 12 + 1
    return date(year, month, 1)


def _month_series(count: int) -> List[date]:
    count = max(1, min(count, 24))
    today = timezone.localdate()
    current = date(today.year, today.month, 1)
    series: List[date] = []
    for offset in range(count - 1, -1, -1):
        series.append(_shift_month(current, -offset))
    return series


def _fetch_goal_map(user_id: str, month_keys: List[str]) -> Dict[str, float]:
    collection = get_expense_goals_collection()
    cursor = collection.find({"user_id": str(user_id), "month": {"$in": month_keys}})
    result: Dict[str, float] = {}
    for doc in cursor:
        month = doc.get("month")
        amount = doc.get("amount")
        if month in month_keys and amount is not None:
            result[month] = float(amount)
    return result


def _monthly_actuals(user_id: str, month_starts: List[date]) -> Dict[str, float]:
    if not month_starts:
        return {}
    collection = get_expenses_collection()
    start_month = month_starts[0]
    end_month = _shift_month(month_starts[-1], 1)
    start_dt = datetime(start_month.year, start_month.month, 1, tzinfo=timezone.get_default_timezone())
    end_dt = datetime(end_month.year, end_month.month, 1, tzinfo=timezone.get_default_timezone())
    query = {
        "user_id": str(user_id),
        "status": "confirmed",
        "selection.amount_value": {"$ne": None},
        "selection_date": {"$gte": start_dt, "$lt": end_dt},
    }
    buckets: Dict[str, float] = { _month_key(month): 0.0 for month in month_starts }
    for doc in collection.find(query):
        record_date = _effective_date(doc)
        if not record_date:
            continue
        month_key = _month_key(record_date.replace(day=1))
        if month_key not in buckets:
            continue
        selection = doc.get("selection", {})
        amount = float(selection.get("amount_value") or 0)
        if amount <= 0:
            continue
        buckets[month_key] = buckets.get(month_key, 0.0) + amount
    return {key: round(value, 2) for key, value in buckets.items()}


def save_monthly_goal(user_id: str, month: str, amount: float) -> None:
    collection = get_expense_goals_collection()
    payload = {
        "user_id": str(user_id),
        "month": month,
        "amount": float(amount),
        "updated_at": timezone.now(),
    }
    collection.update_one(
        {"user_id": str(user_id), "month": month},
        {"$set": payload},
        upsert=True,
    )


def monthly_goal_summary(user_id: str, months: int = 6) -> Dict[str, Any]:
    month_starts = _month_series(months)
    month_keys = [_month_key(month) for month in month_starts]
    goal_map = _fetch_goal_map(user_id, month_keys)
    actual_map = _monthly_actuals(user_id, month_starts)
    goals = [goal_map.get(key) for key in month_keys]
    actuals = [actual_map.get(key, 0.0) for key in month_keys]
    current_key = month_keys[-1] if month_keys else None
    current_goal = goal_map.get(current_key) if current_key else None
    current_actual = actual_map.get(current_key, 0.0) if current_key else 0.0
    progress = None
    if current_goal:
        progress = current_actual / current_goal if current_goal else None
    return {
        "months": month_keys,
        "goals": goals,
        "actuals": actuals,
        "current": {
            "month": current_key,
            "goal": current_goal,
            "actual": current_actual,
            "progress": progress,
        },
    }


def calendar_expense_overview(user_id: str, month: str | None = None) -> Dict[str, Any]:
    if month:
        try:
            base = datetime.strptime(month, "%Y-%m").date()
            month_start = date(base.year, base.month, 1)
        except ValueError as exc:
            raise ValueError("month 형식은 YYYY-MM 이어야 합니다.") from exc
    else:
        today = timezone.localdate()
        month_start = date(today.year, today.month, 1)
    next_month = _shift_month(month_start, 1)
    start_dt = datetime(month_start.year, month_start.month, 1, tzinfo=timezone.get_default_timezone())
    end_dt = datetime(next_month.year, next_month.month, 1, tzinfo=timezone.get_default_timezone())
    collection = get_expenses_collection()
    query = {
        "user_id": str(user_id),
        "status": "confirmed",
        "selection.amount_value": {"$ne": None},
        "selection_date": {"$gte": start_dt, "$lt": end_dt},
    }
    days_map: Dict[str, Dict[str, Any]] = {}
    total = 0.0
    count = 0
    for doc in collection.find(query):
        record_date = _effective_date(doc)
        if not record_date:
            continue
        if isinstance(record_date, datetime):
            day_key = record_date.date().isoformat()
        else:
            day_key = record_date.isoformat()
        selection = doc.get("selection", {})
        amount = float(selection.get("amount_value") or 0)
        if amount <= 0:
            continue
        entry = {
            "id": str(doc.get("_id")),
            "merchant": selection.get("merchant") or "",
            "amount": round(amount, 2),
            "amount_text": selection.get("amount_text") or "",
            "category": selection.get("category") or "",
            "notes": doc.get("notes") or "",
            "split_mode": selection.get("split_mode"),
        }
        day_bucket = days_map.setdefault(day_key, {"date": day_key, "total": 0.0, "entries": []})
        day_bucket["total"] = round(float(day_bucket["total"]) + amount, 2)
        day_bucket["entries"].append(entry)
        total += amount
        count += 1

    days = []
    current = month_start
    while current < next_month:
        key = current.isoformat()
        bucket = days_map.get(key) or {"date": key, "total": 0.0, "entries": []}
        days.append(bucket)
        current += timedelta(days=1)

    average = total / len(days) if days else 0.0
    return {
        "month": f"{month_start.year}-{month_start.month:02d}",
        "days": days,
        "summary": {"total": round(total, 2), "average": round(average, 2), "count": count},
    }
