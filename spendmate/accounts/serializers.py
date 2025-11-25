from __future__ import annotations

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from . import services


class SignupSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    name = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate_email(self, value: str) -> str:
        email = value.lower()
        if services.user_exists(email):
            raise serializers.ValidationError("이미 가입된 이메일입니다.")
        return email

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value

    def create(self, validated_data):
        email = validated_data["email"]
        password = validated_data["password"]
        name = validated_data.get("name") or ""
        return services.create_user(email=email, password=password, name=name)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate_email(self, value: str) -> str:
        return value.lower()
