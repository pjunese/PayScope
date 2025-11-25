from __future__ import annotations

from rest_framework.permissions import BasePermission

from .services import ROLE_ADMIN, ROLE_SUBADMIN, get_user_role


class IsAdminOrSubAdmin(BasePermission):
    message = "관리자만 접근할 수 있습니다."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        role = get_user_role(user)
        return role in {ROLE_ADMIN, ROLE_SUBADMIN}
