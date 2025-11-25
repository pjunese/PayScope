from django.urls import reverse
from rest_framework.test import APITestCase


class AuthenticationFlowTests(APITestCase):
    def test_signup_login_profile(self):
        signup_url = reverse("auth-signup")
        resp = self.client.post(
            signup_url,
            {"email": "user@example.com", "password": "StrongPass!23", "name": "사용자"},
        )
        self.assertEqual(resp.status_code, 201)
        token = resp.data["token"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        profile_resp = self.client.get(reverse("auth-profile"))
        self.assertEqual(profile_resp.status_code, 200)

        login_resp = self.client.post(
            reverse("auth-login"),
            {"email": "user@example.com", "password": "StrongPass!23"},
        )
        self.assertEqual(login_resp.status_code, 200)
        self.assertIn("token", login_resp.data)
