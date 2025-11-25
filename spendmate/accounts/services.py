from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Dict, List, Optional, Union

from bson import ObjectId
from pymongo import ReturnDocument
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password

from spendmate.mongo import get_collection

logger = logging.getLogger(__name__)

ROLE_ADMIN = "admin"
ROLE_SUBADMIN = "subadmin"
ROLE_MEMBER = "member"
ROLE_CHOICES = {ROLE_ADMIN, ROLE_SUBADMIN, ROLE_MEMBER}


def _now() -> datetime:
    return datetime.utcnow().replace(tzinfo=timezone.utc)


def _users_collection():
    collection_name = getattr(settings, "MONGODB_USERS_COLLECTION", "users")
    return get_collection(collection_name)


def _tokens_collection():
    collection_name = getattr(settings, "MONGODB_TOKENS_COLLECTION", "auth_tokens")
    return get_collection(collection_name)


def ensure_object_id(value: Union[str, ObjectId, Dict, "MongoAuthUser"]) -> ObjectId:
    """
    Normalize different representations into a bson ObjectId.
    """
    if isinstance(value, ObjectId):
        return value
    if value is None:
        raise ValueError("ObjectId로 변환할 수 없습니다.")
    if isinstance(value, dict):
        candidate = value.get("_id") or value.get("id")
        return ensure_object_id(candidate)
    if hasattr(value, "mongo_id"):
        return value.mongo_id()
    if hasattr(value, "id"):
        return ensure_object_id(getattr(value, "id"))
    if isinstance(value, str):
        try:
            return ObjectId(value)
        except Exception as exc:  # noqa: BLE001
            raise ValueError("유효하지 않은 사용자 ID 입니다.") from exc
    raise ValueError("ObjectId로 변환할 수 없습니다.")


def _preferred_role(email: Optional[str]) -> str:
    email = (email or "").lower()
    primary_admin = (getattr(settings, "PRIMARY_ADMIN_EMAIL", "") or "").lower()
    if primary_admin and email == primary_admin:
        return ROLE_ADMIN
    return ROLE_MEMBER


def _isoformat(value: Optional[datetime]) -> Optional[str]:
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def _serialize_user(doc: Optional[Dict]) -> Optional[Dict]:
    if not doc:
        return None
    return {
        "id": str(doc.get("_id") or doc.get("id")),
        "email": doc.get("email"),
        "name": doc.get("name") or "",
        "role": doc.get("role") or ROLE_MEMBER,
        "providers": doc.get("providers", []),
        "last_login_at": _isoformat(doc.get("last_login_at")),
        "created_at": _isoformat(doc.get("created_at")),
        "updated_at": _isoformat(doc.get("updated_at")),
    }


def user_exists(email: str) -> bool:
    collection = _users_collection()
    return collection.count_documents({"email": email.lower()}, limit=1) > 0


def create_user(
    email: str,
    password: str,
    name: Optional[str] = None,
    *,
    providers: Optional[List[str]] = None,
) -> Dict:
    email = email.lower()
    if user_exists(email):
        raise ValueError("이미 가입된 이메일입니다.")
    hashed = make_password(password)
    now = _now()
    doc = {
        "email": email,
        "name": name or "",
        "password": hashed,
        "role": _preferred_role(email),
        "providers": providers or ["local"],
        "created_at": now,
        "updated_at": now,
        "last_login_at": None,
    }
    result = _users_collection().insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


def get_user_by_email(email: str) -> Optional[Dict]:
    return _users_collection().find_one({"email": email.lower()})


def get_user_by_id(user_id: Union[str, ObjectId, Dict]) -> Optional[Dict]:
    try:
        object_id = ensure_object_id(user_id)
    except ValueError:
        return None
    return _users_collection().find_one({"_id": object_id})


def authenticate_user(email: str, password: str) -> Optional[Dict]:
    doc = get_user_by_email(email)
    if not doc:
        return None
    if not check_password(password, doc.get("password") or ""):
        return None
    return doc


def _providers_for_update(provider: str) -> Dict:
    if provider:
        return {"$addToSet": {"providers": provider}}
    return {}


def record_user_login(user: Dict, provider: str) -> Dict:
    """
    Update login metadata for the Mongo user document.
    """
    try:
        object_id = ensure_object_id(user)
    except ValueError as exc:
        raise RuntimeError("유효하지 않은 사용자입니다.") from exc

    now = _now()
    update_doc: Dict = {
        "$set": {
            "last_login_at": now,
            "updated_at": now,
        },
        **_providers_for_update(provider),
    }

    doc = _users_collection().find_one_and_update(
        {"_id": object_id},
        update_doc,
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise RuntimeError("사용자 정보를 갱신할 수 없습니다.")
    return _serialize_user(doc) or {}


def get_user_profile(user: Union[str, ObjectId, Dict]) -> Optional[Dict]:
    doc = get_user_by_id(user)
    return _serialize_user(doc)


def get_user_role(user: Union[Dict, "MongoAuthUser", str, ObjectId]) -> str:
    if isinstance(user, dict):
        return user.get("role") or ROLE_MEMBER
    role = getattr(user, "role", None)
    if role in ROLE_CHOICES:
        return role
    profile = get_user_profile(user)
    if profile and profile.get("role") in ROLE_CHOICES:
        return profile["role"]
    email = getattr(user, "email", None)
    return _preferred_role(email)


def list_user_profiles() -> List[Dict]:
    cursor = _users_collection().find().sort("created_at", 1)
    return [_serialize_user(doc) for doc in cursor if doc]


def update_user_role(user_id: Union[str, ObjectId, Dict], role: str) -> Optional[Dict]:
    normalized_role = role.lower()
    if normalized_role not in ROLE_CHOICES:
        raise ValueError("허용되지 않은 회원 유형입니다.")
    object_id = ensure_object_id(user_id)
    doc = _users_collection().find_one_and_update(
        {"_id": object_id},
        {
            "$set": {"role": normalized_role, "updated_at": _now()},
        },
        return_document=ReturnDocument.AFTER,
    )
    return _serialize_user(doc)


def issue_token(user: Dict) -> str:
    object_id = ensure_object_id(user)
    token = secrets.token_hex(32)
    now = _now()
    _tokens_collection().insert_one(
        {
            "key": token,
            "user_id": object_id,
            "created_at": now,
            "last_used_at": now,
        }
    )
    return token


def get_token(token: str) -> Optional[Dict]:
    if not token:
        return None
    return _tokens_collection().find_one({"key": token})


def touch_token(token: str) -> None:
    _tokens_collection().update_one({"key": token}, {"$set": {"last_used_at": _now()}})


def delete_token(token: str) -> None:
    _tokens_collection().delete_one({"key": token})


def delete_tokens_for_user(user: Union[str, ObjectId, Dict]) -> None:
    try:
        object_id = ensure_object_id(user)
    except ValueError:
        return
    _tokens_collection().delete_many({"user_id": object_id})
