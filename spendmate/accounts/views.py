from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import secrets
import time
from typing import Dict, Optional
from urllib.parse import urlencode, urlparse

import requests
from django.conf import settings
from django.http import HttpResponse
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsAdminOrSubAdmin
from .serializers import LoginSerializer, SignupSerializer
from .services import (
    ROLE_ADMIN,
    delete_token,
    get_user_by_email,
    get_user_profile,
    get_user_role,
    issue_token,
    list_user_profiles,
    record_user_login,
    authenticate_user,
    update_user_role,
)
from . import services

_STATE_TTL_SECONDS = 600
_OAUTH_STATE_RESULTS: Dict[str, Dict[str, object]] = {}


def _user_payload(user: object | None, profile: Optional[dict] = None) -> dict:
    if profile:
        return profile

    return {
        "id": getattr(user, "id", None),
        "email": getattr(user, "email", ""),
        "name": getattr(user, "first_name", "") or getattr(user, "name", ""),
        "role": get_user_role(user) if user else services.ROLE_MEMBER,
    }


def _build_state(provider: str) -> str:
    nonce = secrets.token_urlsafe(16)
    timestamp = int(time.time())
    base = f"{provider}:{nonce}:{timestamp}"
    signature = hmac.new(settings.SECRET_KEY.encode(), base.encode(), hashlib.sha256).hexdigest()
    payload = f"{nonce}:{timestamp}:{signature}"
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def _verify_state(provider: str, encoded: str, *, ttl_seconds: int = 600) -> bool:
    padded = encoded + "=" * (-len(encoded) % 4)
    try:
        decoded = base64.urlsafe_b64decode(padded.encode()).decode()
        nonce, timestamp_str, signature = decoded.split(":")
    except (ValueError, binascii.Error):
        return False
    base = f"{provider}:{nonce}:{timestamp_str}"
    expected_signature = hmac.new(settings.SECRET_KEY.encode(), base.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected_signature):
        return False
    try:
        timestamp = int(timestamp_str)
    except ValueError:
        return False
    return (time.time() - timestamp) <= ttl_seconds


def _register_oauth_result(
    *, state: str, provider: str, token: Optional[str], user: Optional[dict], error: Optional[str]
) -> None:
    _cleanup_expired_results()
    _OAUTH_STATE_RESULTS[state] = {
        "state": state,
        "provider": provider,
        "token": token,
        "user": user,
        "error": error,
        "timestamp": time.time(),
    }


def _pop_oauth_result(state: str) -> Optional[dict]:
    entry = _OAUTH_STATE_RESULTS.pop(state, None)
    if not entry:
        return None
    if time.time() - entry.get("timestamp", 0) > _STATE_TTL_SECONDS:
        return None
    entry.pop("timestamp", None)
    return entry


def _cleanup_expired_results() -> None:
    now = time.time()
    expired = [
        key for key, value in _OAUTH_STATE_RESULTS.items() if now - value.get("timestamp", 0) > _STATE_TTL_SECONDS
    ]
    for key in expired:
        _OAUTH_STATE_RESULTS.pop(key, None)


def _frontend_origin() -> str:
    url = getattr(settings, "CLIENT_URL", "http://localhost:5173")
    return url.rstrip("/")


def _oauth_response(
    provider: str,
    *,
    token: Optional[str] = None,
    user: Optional[dict] = None,
    error: str | None = None,
    state: str | None = None,
) -> HttpResponse:
    message_type = "oauth-success" if not error else "oauth-error"
    payload: Dict[str, Optional[dict] | Optional[str]] = {"type": message_type, "provider": provider}
    if state:
        payload["state"] = state
    if error:
        payload["error"] = error
    else:
        payload["token"] = token
        payload["user"] = user
    serialized = json.dumps(payload)
    client_origin = _frontend_origin()
    origins = {client_origin}
    try:
        parsed = urlparse(client_origin)
        hostname = parsed.hostname or ""
        scheme = parsed.scheme or "http"
        port = f":{parsed.port}" if parsed.port else ""
        if hostname == "localhost":
            origins.add(f"{scheme}://127.0.0.1{port}")
        elif hostname == "127.0.0.1":
            origins.add(f"{scheme}://localhost{port}")
    except Exception:
        pass
    origins_js = json.dumps(sorted(origins))

    html = f"""
<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>OAuth 완료</title>
  </head>
  <body style="margin:0;background:#fff;">
    <script>
      (function() {{
        const payload = {serialized};
        const targets = {origins_js};
        const opener = window.opener;
        const broadcastChannelName = "spendmate-oauth";
        const closeWindow = () => {{
          try {{
            window.close();
          }} catch (err) {{}}
          // Fallback text only if the window refuses to close itself.
          setTimeout(() => {{
            if (!window.closed) {{
              document.body.innerHTML =
                '<div style="font-family:sans-serif;padding:24px;text-align:center;color:#333;">' +
                '<p style="margin:0 0 8px;font-size:16px;">로그인이 완료되었습니다.</p>' +
                '<p style="margin:0;font-size:14px;color:#555;">이 창을 닫아주세요.</p>' +
                '</div>';
            }}
          }}, 800);
        }};
        const notifyViaBroadcast = () => {{
          try {{
            const channel = new BroadcastChannel(broadcastChannelName);
            channel.postMessage(payload);
            channel.close();
          }} catch (err) {{}}
        }};
        const notifyViaStorage = () => {{
          if (!payload.state) {{
            return;
          }}
          try {{
            const key = `spendmate:oauth:${{payload.state}}`;
            localStorage.setItem(key, JSON.stringify({{ payload, timestamp: Date.now() }}));
            localStorage.removeItem(key);
          }} catch (err) {{}}
        }};
        if (opener) {{
          let delivered = false;
          targets.forEach((target) => {{
            try {{
              opener.postMessage(payload, target);
              delivered = true;
            }} catch (err) {{}}
          }});
          if (!delivered) {{
            try {{
              opener.postMessage(payload, "*");
            }} catch (err) {{}}
          }}
        }} else {{
          notifyViaBroadcast();
          notifyViaStorage();
        }}
        closeWindow();
      }})();
    </script>
  </body>
</html>
"""
    return HttpResponse(html)


def _get_or_create_oauth_user(provider: str, email: str, name: str | None = None) -> Dict:
    existing = get_user_by_email(email)
    if existing:
        return existing
    random_password = secrets.token_urlsafe(24)
    return services.create_user(email=email, password=random_password, name=name, providers=[provider])


class SignupView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user_doc = serializer.save()
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        token = issue_token(user_doc)
        profile = record_user_login(user_doc, provider="local")
        return Response({"token": token, "user": _user_payload(user_doc, profile)}, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]
        user_doc = authenticate_user(email, password)
        if user_doc is None:
            return Response({"detail": "이메일 또는 비밀번호가 올바르지 않습니다."}, status=status.HTTP_400_BAD_REQUEST)
        token = issue_token(user_doc)
        profile = record_user_login(user_doc, provider="local")
        return Response({"token": token, "user": _user_payload(user_doc, profile)}, status=status.HTTP_200_OK)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        token = getattr(request, "auth", None)
        if token:
            delete_token(token)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        profile = get_user_profile(request.user)
        return Response(_user_payload(request.user, profile), status=status.HTTP_200_OK)


class OAuthProvidersView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        config = {
            "google": {
                "client_id": getattr(settings, "GOOGLE_CLIENT_ID", "") or "",
                "callback_url": getattr(settings, "GOOGLE_CALLBACK_URL", "") or "",
            },
            "naver": {
                "client_id": getattr(settings, "NAVER_CLIENT_ID", "") or "",
                "callback_url": getattr(settings, "NAVER_CALLBACK_URL", "") or "",
            },
        }
        return Response(config, status=status.HTTP_200_OK)


class _BaseOAuthStartView(APIView):
    permission_classes = [AllowAny]
    provider: str = ""
    auth_base_url: str = ""
    scope: str = ""
    extra_params: Dict[str, str] = {}

    def get_client_id(self) -> str | None:
        return getattr(settings, f"{self.provider.upper()}_CLIENT_ID", None)

    def get_callback_url(self) -> str | None:
        return getattr(settings, f"{self.provider.upper()}_CALLBACK_URL", None)

    def get(self, request, *args, **kwargs):
        client_id = self.get_client_id()
        callback = self.get_callback_url()
        if not client_id or not callback:
            return Response({"detail": "OAuth 공급자 설정이 누락되었습니다."}, status=status.HTTP_400_BAD_REQUEST)

        state = _build_state(self.provider)
        params = {
            "client_id": client_id,
            "redirect_uri": callback,
            "response_type": "code",
            "scope": self.scope,
            "state": state,
        }
        params.update(self.extra_params)
        auth_url = f"{self.auth_base_url}?{urlencode(params)}"
        return Response({"auth_url": auth_url, "state": state})


class _BaseOAuthCallbackView(APIView):
    permission_classes = [AllowAny]
    provider: str = ""

    def get_client_id(self) -> str | None:
        return getattr(settings, f"{self.provider.upper()}_CLIENT_ID", None)

    def get_client_secret(self) -> str | None:
        return getattr(settings, f"{self.provider.upper()}_CLIENT_SECRET", None)

    def get_callback_url(self) -> str | None:
        return getattr(settings, f"{self.provider.upper()}_CALLBACK_URL", None)

    def handle_user(self, state: str, email: str, name: str | None) -> HttpResponse:
        user_doc = _get_or_create_oauth_user(self.provider, email, name)
        token_value = issue_token(user_doc)
        profile = record_user_login(user_doc, provider=self.provider)
        payload = _user_payload(user_doc, profile)
        _register_oauth_result(state=state, provider=self.provider, token=token_value, user=payload, error=None)
        return _oauth_response(self.provider, token=token_value, user=payload, state=state)

    def get(self, request, *args, **kwargs):
        state = request.query_params.get("state")
        if request.query_params.get("error"):
            error_description = request.query_params.get("error_description") or "OAuth 인증이 취소되었습니다."
            if state:
                _register_oauth_result(
                    state=state,
                    provider=self.provider,
                    token=None,
                    user=None,
                    error=error_description,
                )
            return _oauth_response(self.provider, error=error_description, state=state)

        if not state or not _verify_state(self.provider, state):
            return _oauth_response(self.provider, error="검증되지 않은 요청입니다.", state=state)

        code = request.query_params.get("code")
        if not code:
            return _oauth_response(self.provider, error="인증 코드가 제공되지 않았습니다.", state=state)

        try:
            email, name = self.exchange_code(code, state)
        except Exception as exc:  # noqa: BLE001
            _register_oauth_result(state=state, provider=self.provider, token=None, user=None, error=str(exc))
            return _oauth_response(self.provider, error=str(exc), state=state)

        return self.handle_user(state, email, name)

    def exchange_code(self, code: str, state: str) -> tuple[str, Optional[str]]:
        raise NotImplementedError


class GoogleOAuthStartView(_BaseOAuthStartView):
    provider = "google"
    auth_base_url = "https://accounts.google.com/o/oauth2/v2/auth"
    scope = "openid email profile"
    extra_params = {"access_type": "offline", "prompt": "consent"}


class GoogleOAuthCallbackView(_BaseOAuthCallbackView):
    provider = "google"

    token_url = "https://oauth2.googleapis.com/token"
    token_info_url = "https://oauth2.googleapis.com/tokeninfo"

    def exchange_code(self, code: str, state: str) -> tuple[str, Optional[str]]:
        client_id = self.get_client_id()
        client_secret = self.get_client_secret()
        redirect_uri = self.get_callback_url()
        if not client_id or not client_secret or not redirect_uri:
            raise RuntimeError("Google OAuth 설정이 올바르지 않습니다.")

        data = {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }
        response = requests.post(self.token_url, data=data, timeout=10)
        if response.status_code != 200:
            raise RuntimeError(f"토큰 요청 실패: {response.text}")
        payload = response.json()
        id_token = payload.get("id_token")
        if not id_token:
            raise RuntimeError("ID 토큰이 제공되지 않았습니다.")

        info_resp = requests.get(self.token_info_url, params={"id_token": id_token}, timeout=10)
        if info_resp.status_code != 200:
            raise RuntimeError("토큰 정보를 확인할 수 없습니다.")
        token_info = info_resp.json()
        email = token_info.get("email")
        if not email:
            raise RuntimeError("이메일 정보를 가져오지 못했습니다.")
        name = token_info.get("name") or token_info.get("given_name")
        return email, name


class NaverOAuthStartView(_BaseOAuthStartView):
    provider = "naver"
    auth_base_url = "https://nid.naver.com/oauth2.0/authorize"
    scope = "name email"


class NaverOAuthCallbackView(_BaseOAuthCallbackView):
    provider = "naver"

    token_url = "https://nid.naver.com/oauth2.0/token"
    profile_url = "https://openapi.naver.com/v1/nid/me"

    def exchange_code(self, code: str, state: str) -> tuple[str, Optional[str]]:
        client_id = self.get_client_id()
        client_secret = self.get_client_secret()
        redirect_uri = self.get_callback_url()
        if not client_id or not client_secret or not redirect_uri:
            raise RuntimeError("Naver OAuth 설정이 올바르지 않습니다.")

        params = {
            "grant_type": "authorization_code",
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "state": state,
            "redirect_uri": redirect_uri,
        }
        response = requests.get(self.token_url, params=params, timeout=10)
        if response.status_code != 200:
            raise RuntimeError(f"토큰 요청 실패: {response.text}")
        payload = response.json()
        access_token = payload.get("access_token")
        if not access_token:
            raise RuntimeError("액세스 토큰이 제공되지 않았습니다.")

        profile_resp = requests.get(self.profile_url, headers={"Authorization": f"Bearer {access_token}"}, timeout=10)
        if profile_resp.status_code != 200:
            raise RuntimeError("사용자 정보를 가져오지 못했습니다.")
        profile = profile_resp.json().get("response") or {}
        email = profile.get("email")
        name = profile.get("name") or profile.get("nickname")
        if not email:
            raise RuntimeError("이메일 정보를 가져오지 못했습니다.")
        return email, name


class OAuthStatusView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, state: str, *args, **kwargs):
        result = _pop_oauth_result(state)
        if not result:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(result, status=status.HTTP_200_OK)


class AdminUserListView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrSubAdmin]

    def get(self, request, *args, **kwargs):
        return Response(list_user_profiles(), status=status.HTTP_200_OK)


class AdminUserRoleView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrSubAdmin]

    def patch(self, request, user_id: str, *args, **kwargs):
        actor_role = get_user_role(request.user)
        if actor_role != ROLE_ADMIN:
            return Response({"detail": "권한이 부족합니다."}, status=status.HTTP_403_FORBIDDEN)

        target_profile = get_user_profile(user_id)
        if not target_profile:
            return Response({"detail": "대상 회원을 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)

        next_role = (request.data or {}).get("role")
        if not next_role:
            return Response({"detail": "role 값을 지정해주세요."}, status=status.HTTP_400_BAD_REQUEST)

        primary_admin = (getattr(settings, "PRIMARY_ADMIN_EMAIL", "") or "").lower()
        if target_profile.get("email", "").lower() == primary_admin and next_role.lower() != ROLE_ADMIN:
            return Response({"detail": "기본 관리자 계정의 역할은 변경할 수 없습니다."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            updated = update_user_role(user_id, next_role)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if not updated:
            return Response({"detail": "대상 회원을 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        return Response(updated, status=status.HTTP_200_OK)
