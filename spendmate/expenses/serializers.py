from datetime import datetime

from django.utils import timezone
from rest_framework import serializers


class ExpenseUploadSerializer(serializers.Serializer):
    file = serializers.ImageField()
    user_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class ExpenseConfirmSerializer(serializers.Serializer):
    document_id = serializers.CharField()
    merchant = serializers.CharField(required=False, allow_blank=True, default="")
    quantity = serializers.CharField(required=False, allow_blank=True, default="")
    amount_text = serializers.CharField(required=False, allow_blank=True, default="")
    amount_value = serializers.DecimalField(
        required=False, allow_null=True, max_digits=12, decimal_places=2
    )
    date_text = serializers.CharField(required=False, allow_blank=True, default="")
    category = serializers.CharField(required=False, allow_blank=True, default="")
    split_mode = serializers.ChoiceField(choices=("equal", "custom"), default="equal")
    participant_count = serializers.IntegerField(required=False, min_value=1, max_value=99, default=1)
    custom_share = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class ExpenseGoalSerializer(serializers.Serializer):
    month = serializers.CharField(required=False, allow_blank=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)

    def validate_month(self, value):
        if not value:
            today = timezone.localdate()
            return f"{today.year}-{today.month:02d}"
        try:
            datetime_obj = datetime.strptime(value, "%Y-%m")
            return f"{datetime_obj.year}-{datetime_obj.month:02d}"
        except ValueError as exc:
            raise serializers.ValidationError("월 형식은 YYYY-MM 이어야 합니다.") from exc
