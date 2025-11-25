from django.urls import path

from .views import (
    AdminUserListView,
    AdminUserRoleView,
    GoogleOAuthCallbackView,
    GoogleOAuthStartView,
    LoginView,
    LogoutView,
    NaverOAuthCallbackView,
    NaverOAuthStartView,
    OAuthProvidersView,
    OAuthStatusView,
    ProfileView,
    SignupView,
)

urlpatterns = [
    path("signup/", SignupView.as_view(), name="auth-signup"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", ProfileView.as_view(), name="auth-profile"),
    path("providers/", OAuthProvidersView.as_view(), name="auth-providers"),
    path("oauth/google/start/", GoogleOAuthStartView.as_view(), name="auth-google-start"),
    path("oauth/google/callback/", GoogleOAuthCallbackView.as_view(), name="auth-google-callback"),
    path("oauth/naver/start/", NaverOAuthStartView.as_view(), name="auth-naver-start"),
    path("oauth/naver/callback/", NaverOAuthCallbackView.as_view(), name="auth-naver-callback"),
    path("oauth/status/<str:state>/", OAuthStatusView.as_view(), name="auth-oauth-status"),
    path("admin/users/", AdminUserListView.as_view(), name="auth-admin-users"),
    path("admin/users/<str:user_id>/role/", AdminUserRoleView.as_view(), name="auth-admin-user-role"),
]
