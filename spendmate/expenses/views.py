from datetime import datetime, timezone

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import ExpenseConfirmSerializer, ExpenseGoalSerializer, ExpenseUploadSerializer
from .services import (
    OCRServiceError,
    call_ocr_service,
    daily_expense_report,
    persist_expense,
    save_user_selection,
    category_expense_report,
    latest_expense_document,
    list_expense_documents,
    delete_expense_document,
    monthly_goal_summary,
    save_monthly_goal,
    calendar_expense_overview,
)
from accounts.permissions import IsAdminOrSubAdmin


class ExpenseUploadView(APIView):
    """Accepts an image, runs OCR, and stores the parsed expense document."""

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = ExpenseUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        file_obj = serializer.validated_data["file"]
        user_id = request.user.id
        notes = serializer.validated_data.get("notes")

        try:
            ocr_payload = call_ocr_service(file_obj, file_obj.name)
        except OCRServiceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        document_id = persist_expense(ocr_payload, user_id=user_id, notes=notes)

        return Response(
            {
                "id": document_id,
                "ocr": ocr_payload,
            },
            status=status.HTTP_201_CREATED,
        )


class ExpenseConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = ExpenseConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        selection = {
            "merchant": data.get("merchant") or "",
            "quantity": data.get("quantity") or "",
            "amount_text": data.get("amount_text") or "",
            "amount_value": float(data["amount_value"]) if data.get("amount_value") is not None else None,
            "date_text": data.get("date_text") or "",
            "category": data.get("category") or "",
            "split_mode": data.get("split_mode"),
            "participant_count": data.get("participant_count") or 1,
            "custom_share": data.get("custom_share"),
            "notes": data.get("notes"),
        }

        try:
            doc = save_user_selection(
                data["document_id"],
                user_id=request.user.id,
                selection=selection,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except LookupError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)

        return Response(
            {
                "id": str(doc["_id"]),
                "status": doc.get("status", "confirmed"),
                "selection": doc.get("selection"),
            },
            status=status.HTTP_200_OK,
        )


class DailyExpenseReportView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _parse_date(value: str | None):
        if not value:
            return None
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError as exc:
            raise ValueError("날짜 형식은 YYYY-MM-DD 이어야 합니다.") from exc

    def get(self, request, *args, **kwargs):
        try:
            start = self._parse_date(request.query_params.get("start"))
            end = self._parse_date(request.query_params.get("end"))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            report = daily_expense_report(
                request.user.id,
                start=start,
                end=end,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(report, status=status.HTTP_200_OK)


class CategoryExpenseReportView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _parse_date(value: str | None):
        if not value:
            return None
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError as exc:
            raise ValueError("날짜 형식은 YYYY-MM-DD 이어야 합니다.") from exc

    def get(self, request, *args, **kwargs):
        try:
            start = self._parse_date(request.query_params.get("start"))
            end = self._parse_date(request.query_params.get("end"))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            report = category_expense_report(
                request.user.id,
                start=start,
                end=end,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(report, status=status.HTTP_200_OK)


class LatestExpenseView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _serialize_datetime(value):
        if value is None:
            return None
        if isinstance(value, datetime):
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return value.isoformat()
        return str(value)

    def get(self, request, *args, **kwargs):
        doc = latest_expense_document(request.user.id)
        if not doc:
            return Response(status=status.HTTP_204_NO_CONTENT)
        payload = {
            "id": str(doc.get("_id")),
            "status": doc.get("status"),
            "ocr": doc.get("ocr"),
            "selection": doc.get("selection") or {},
            "selection_date": self._serialize_datetime(doc.get("selection_date")),
            "confirmed_at": self._serialize_datetime(doc.get("confirmed_at")),
        }
        return Response(payload, status=status.HTTP_200_OK)


class AdminExpenseListView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrSubAdmin]

    @staticmethod
    def _serialize_datetime(value):
        if value is None:
            return None
        if isinstance(value, datetime):
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return value.isoformat()
        return str(value)

    def get(self, request, *args, **kwargs):
        limit = request.query_params.get("limit")
        try:
            limit = max(1, min(200, int(limit))) if limit else 50
        except ValueError:
            limit = 50
        docs = list_expense_documents(limit)
        payload = []
        for index, doc in enumerate(docs, start=1):
            payload.append(
                {
                    "index": index,
                    "id": str(doc.get("_id")),
                    "user_id": doc.get("user_id"),
                    "status": doc.get("status"),
                    "ocr_engine": doc.get("ocr_engine"),
                    "ocr": doc.get("ocr"),
                    "selection": doc.get("selection") or {},
                    "selection_date": self._serialize_datetime(doc.get("selection_date")),
                    "confirmed_at": self._serialize_datetime(doc.get("confirmed_at")),
                    "created_at": self._serialize_datetime(doc.get("created_at")),
                }
            )
        return Response(payload, status=status.HTTP_200_OK)

    def delete(self, request, *args, **kwargs):
        document_id = request.data.get("id") or request.query_params.get("id")
        if not document_id:
            return Response({"detail": "삭제할 문서 ID를 지정해주세요."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            success = delete_expense_document(document_id)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if not success:
            return Response({"detail": "대상 문서를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ExpenseGoalView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        months = request.query_params.get("months")
        try:
            months = int(months) if months is not None else 6
        except ValueError:
            months = 6
        data = monthly_goal_summary(request.user.id, months)
        return Response(data, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        serializer = ExpenseGoalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        month = serializer.validated_data["month"]
        amount = float(serializer.validated_data["amount"])
        save_monthly_goal(request.user.id, month, amount)
        months = request.query_params.get("months")
        try:
            months = int(months) if months is not None else 6
        except ValueError:
            months = 6
        data = monthly_goal_summary(request.user.id, months)
        return Response(data, status=status.HTTP_200_OK)


class ExpenseCalendarView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        month = request.query_params.get("month")
        try:
            data = calendar_expense_overview(request.user.id, month)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(data, status=status.HTTP_200_OK)

    def delete(self, request, *args, **kwargs):
        document_id = request.data.get("id") or request.query_params.get("id")
        if not document_id:
            return Response({"detail": "삭제할 문서 ID를 지정해주세요."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            success = delete_expense_document(document_id)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if not success:
            return Response({"detail": "대상 문서를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
