from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from .utils import extract_amount, extract_datetime, normalize_text, last_number


@dataclass
class ReceiptItem:
    name: str
    quantity: Optional[float]
    unit_price: Optional[int]
    total_price: Optional[int]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "quantity": self.quantity,
            "unit_price": self.unit_price,
            "total_price": self.total_price,
        }


class ReceiptParser:
    """Parse generic retail receipts with table-like structures."""

    name = "receipt"
    HEADER_KEYWORDS = ("매장", "점", "주문", "영수", "결제", "금액", "원")

    def supports(self, lines: List[Dict[str, Any]], raw_text: str) -> bool:
        normalized = raw_text.replace("\n", " ")
        return "영수증" in normalized or "매장" in normalized

    def parse(self, lines: List[Dict[str, Any]], raw_text: str) -> Dict[str, Any]:
        sorted_lines = self._sorted_lines(lines)
        header = self._extract_header(sorted_lines, raw_text)
        items = self._extract_items(sorted_lines)
        totals = self._extract_totals(sorted_lines, items)

        if totals.get("total") is None:
            summed_total = sum(item.total_price or 0 for item in items)
            if summed_total:
                totals["total"] = summed_total

        return {
            "merchant": header.get("merchant"),
            "timestamp": header.get("timestamp"),
            "items": [item.to_dict() for item in items],
            "totals": totals,
        }

    def _sorted_lines(self, lines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        enriched: List[Tuple[float, float, Dict[str, Any]]] = []
        for line in lines:
            bbox = line.get("bbox")
            if bbox is None:
                continue
            arr = np.asarray(bbox)
            center_x = float(np.mean(arr[:, 0]))
            center_y = float(np.mean(arr[:, 1]))
            enriched.append((center_y, center_x, line))

        enriched.sort(key=lambda item: (item[0], item[1]))

        grouped: List[List[Dict[str, Any]]] = []
        last_y = None
        threshold = 12.0
        for center_y, _, line in enriched:
            if last_y is None or abs(center_y - last_y) > threshold:
                grouped.append([])
            grouped[-1].append(line)
            last_y = center_y

        sorted_lines: List[Dict[str, Any]] = []
        for group in grouped:
            segments = []
            for segment in sorted(group, key=lambda item: np.mean(np.asarray(item["bbox"])[:, 0])):
                text = normalize_text(segment.get("text", ""))
                if not text:
                    continue
                bbox = np.asarray(segment["bbox"])
                segments.append(
                    {
                        "text": text,
                        "center_x": float(np.mean(bbox[:, 0])),
                        "center_y": float(np.mean(bbox[:, 1])),
                    }
                )

            if not segments:
                continue

            combined_text = " ".join(seg["text"] for seg in segments)
            sorted_lines.append(
                {
                    "text": combined_text,
                    "segments": segments,
                }
            )
        return sorted_lines

    def _extract_header(self, lines: List[Dict[str, Any]], raw_text: str) -> Dict[str, Any]:
        header = {"merchant": None, "timestamp": None}
        for line in lines[:10]:
            for segment in line.get("segments", []):
                text = segment["text"]
                condensed = text.replace(" ", "")
                if header["merchant"] is None:
                    if "매장" in condensed or any(keyword in condensed for keyword in ("카페", "커피", "점")):
                        cleaned = self._clean_labeled_value(text)
                        if cleaned:
                            header["merchant"] = cleaned
                if header["timestamp"] is None:
                    ts = extract_datetime(condensed)
                    if ts:
                        header["timestamp"] = ts
        if not header["merchant"]:
            header["merchant"] = self._guess_merchant(raw_text)
        return header

    def _guess_merchant(self, raw_text: str) -> Optional[str]:
        lines = raw_text.splitlines()
        for line in lines[:5]:
            cleaned = normalize_text(line)
            if cleaned and re.search(r"[가-힣]{2,}", cleaned):
                return cleaned
        return None

    def _clean_labeled_value(self, text: str) -> str:
        if "]" in text:
            return text.split("]", 1)[-1].strip()
        if ":" in text:
            return text.split(":", 1)[-1].strip()
        return text.strip()

    def _extract_items(self, lines: List[Dict[str, Any]]) -> List[ReceiptItem]:
        items: List[ReceiptItem] = []
        header_idx = None
        for idx, line in enumerate(lines):
            text = line.get("text", "")
            text_no_space = text.replace(" ", "")
            if any(keyword in text_no_space for keyword in ("상품", "품명", "내역")):
                header_idx = idx
                break

        if header_idx is None:
            return items

        columns = self._locate_columns(lines[: header_idx + 2])
        buffer_segments: List[Dict[str, Any]] = []
        for raw_line in lines[header_idx + 1 :]:
            text = raw_line.get("text", "")
            if not text:
                continue
            if any(keyword in text for keyword in ("합계", "부가세", "총", "세액", "거래", "할인", "금액", "부가")) or text.strip() in {"액", "세"}:
                if buffer_segments:
                    item = self._parse_item_segments(buffer_segments, columns)
                    if item:
                        items.append(item)
                break
            for segment in raw_line.get("segments", []):
                if segment["text"] in {"상품명", "단가", "수량", "금액"}:
                    continue
                buffer_segments.append(segment)
            item = self._parse_item_segments(buffer_segments, columns)
            if item and item.unit_price is not None and item.total_price is not None:
                items.append(item)
                buffer_segments = []

        if buffer_segments:
            item = self._parse_item_segments(buffer_segments, columns)
            if item:
                items.append(item)

        return items

    def _parse_item_segments(self, segments: List[Dict[str, Any]], columns: Dict[str, float]) -> Optional[ReceiptItem]:
        if len(segments) < 2:
            return None

        name_parts = []
        numeric_segments: List[str] = []
        potential_quantities: List[str] = []

        assigned_values = {"quantity": [], "unit": [], "total": []}

        for segment in segments:
            text = segment["text"]
            digits = re.sub(r"\D", "", text)
            if not digits:
                name_parts.append(text)
                continue
            if text.isdigit() and text.startswith("0") and len(text) >= 5:
                name_parts.append(text)
                continue

            column = self._assign_column(segment, columns)
            if column == "quantity":
                if len(digits) <= 3 and "." not in text and "," not in text:
                    potential_quantities.append(text)
                    continue
                column = "unit"
            if column == "unit":
                assigned_values["unit"].append(text)
            elif column == "total" and len(digits) <= 3 and "." not in text:
                potential_quantities.append(text)
            elif column == "total":
                assigned_values["total"].append(text)
            else:
                if any(ch in text for ch in ",.원"):
                    numeric_segments.append(text)
                elif len(digits) <= 3:
                    potential_quantities.append(text)
                else:
                    name_parts.append(text)

        name = " ".join(name_parts).strip()
        if not name:
            return None
        stopwords = {"액", "금", "합", "합계", "금액", "세", "할인내역", "부가세", "부가세과세물품가액"}
        if any(keyword in name for keyword in stopwords):
            return None

        quantity = self._derive_quantity(potential_quantities)

        unit_candidates = assigned_values["unit"] + numeric_segments
        total_candidates = assigned_values["total"] + numeric_segments
        unit_price, total_price = self._derive_prices(unit_candidates, total_candidates, quantity)

        if unit_price is None and total_price is None:
            return None

        if quantity is None:
            quantity = 1.0

        if unit_price is None and total_price is not None and quantity:
            unit_price = int(total_price / quantity)

        if total_price is None and unit_price is not None and quantity:
            total_price = int(unit_price * quantity)

        return ReceiptItem(name=name, quantity=quantity, unit_price=unit_price, total_price=total_price)

    def _derive_quantity(self, numeric_tokens: List[str]) -> Optional[float]:
        for token in numeric_tokens:
            cleaned = token.replace("개", "")
            if "." in cleaned or "," in cleaned:
                continue
            try:
                value = int(cleaned)
                if 0 < value <= 100:
                    return float(value)
            except ValueError:
                continue
        return None

    def _derive_prices(
        self,
        unit_tokens: List[str],
        total_tokens: List[str],
        quantity: Optional[float],
    ) -> Tuple[Optional[int], Optional[int]]:
        unit_amounts = []
        for token in unit_tokens:
            cleaned = re.sub(r"[^0-9]", "", token)
            if not cleaned:
                continue
            try:
                amount = int(cleaned)
            except ValueError:
                continue
            if amount == 0:
                continue
            unit_amounts.append(amount)

        total_amounts = []
        for token in total_tokens:
            cleaned = re.sub(r"[^0-9]", "", token)
            if not cleaned:
                continue
            try:
                amount = int(cleaned)
            except ValueError:
                continue
            if amount == 0:
                continue
            total_amounts.append(amount)

        unit_price = max(unit_amounts) if unit_amounts else None
        total_price = max(total_amounts) if total_amounts else None

        if unit_price is None and quantity and quantity > 0:
            unit_price = int(total_price / quantity)

        return unit_price, total_price

    def _extract_totals(self, lines: List[Dict[str, Any]], items: List[ReceiptItem]) -> Dict[str, Optional[int]]:
        subtotal = sum(item.total_price or 0 for item in items)
        total = None
        for line in reversed(lines):
            text = line.get("text", "")
            candidate = last_number(text)
            if not candidate or candidate < 1000:
                continue
            if subtotal and 0 < candidate <= subtotal:
                total = candidate
                break
        if total is None:
            total = subtotal or None
        discount = None
        if subtotal and total and total < subtotal:
            discount = subtotal - total
        return {"total": total, "subtotal": subtotal or None, "discount": discount}

    def _first_number(self, text: str) -> Optional[int]:
        match = re.search(r"\d[\d,\.]{0,10}", text)
        if not match:
            return None
        digits = re.sub(r"[^0-9]", "", match.group(0))
        if not digits:
            return None
        try:
            return int(digits)
        except ValueError:
            return None

    def _locate_columns(self, lines: List[Dict[str, Any]]) -> Dict[str, float]:
        columns: Dict[str, float] = {}
        for line in lines:
            for segment in line.get("segments", []):
                text = segment["text"]
                cx = segment["center_x"]
                if "단가" in text and "unit" not in columns:
                    columns["unit"] = cx
                elif "수량" in text and "quantity" not in columns:
                    columns["quantity"] = cx
                elif any(keyword in text for keyword in ("금액", "합계", "총금액")) and "total" not in columns:
                    columns["total"] = cx
        return columns

    def _assign_column(self, segment: Dict[str, Any], columns: Dict[str, float]) -> Optional[str]:
        if not columns:
            return None
        best = None
        best_dist = float("inf")
        for key, pos in columns.items():
            dist = abs(segment["center_x"] - pos)
            if dist < best_dist:
                best = key
                best_dist = dist
        if best is not None and best_dist <= 90:
            return best
        return None
