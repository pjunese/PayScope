from __future__ import annotations

from typing import Optional, Tuple

from bson import ObjectId
from django.utils.encoding import smart_str
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication, get_authorization_header

from . import services


class MongoAuthUser:
    """Lightweight user object for DRF based on MongoDB documents."""

    def __init__(self, doc: dict):
        self._doc = doc
        self.id = str(doc.get("_id") or doc.get("id"))
        self.email = doc.get("email", "")
        self.name = doc.get("name", "")
        self.role = doc.get("role", services.ROLE_MEMBER)

    @property
    def first_name(self) -> str:
        return self.name

    @property
    def is_authenticated(self) -> bool:  # pragma: no cover - DRF contract
        return True

    @property
    def is_anonymous(self) -> bool:  # pragma: no cover - DRF contract
        return False

    def mongo_id(self) -> ObjectId:
        return services.ensure_object_id(self._doc)


class MongoTokenAuthentication(BaseAuthentication):
    """
    Custom DRF authentication backend that validates API tokens stored in MongoDB.
    """

    keyword = b"token"

    def authenticate(self, request) -> Optional[Tuple[MongoAuthUser, str]]:
        auth = get_authorization_header(request).split()
        if not auth:
            return None
        if auth[0].lower() != self.keyword:
            return None
        if len(auth) != 2:
            raise exceptions.AuthenticationFailed("유효하지 않은 인증 헤더입니다.")

        token = smart_str(auth[1])
        token_doc = services.get_token(token)
        if not token_doc:
            raise exceptions.AuthenticationFailed("토큰이 유효하지 않습니다.")

        user_doc = services.get_user_by_id(token_doc.get("user_id"))
        if not user_doc:
            services.delete_token(token)
            raise exceptions.AuthenticationFailed("사용자를 찾을 수 없습니다.")

        services.touch_token(token)
        return MongoAuthUser(user_doc), token
