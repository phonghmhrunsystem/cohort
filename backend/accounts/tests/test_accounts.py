import warnings

from django.conf import settings
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.backends import TokenBackend
from rest_framework_simplejwt.tokens import AccessToken

from accounts.models import User
from audit.models import AuditLog


class AccountApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            "admin@example.test", "pw", role="ADMIN"
        )
        self.student = User.objects.create_user(
            "student@example.test", "pw", role="STUDENT"
        )
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(self.admin)

    def test_inactive_user_cannot_obtain_token(self):
        user = User.objects.create_user(
            "inactive@example.test", "pw", role="STUDENT", is_active=False
        )

        response = self.client.post(
            "/api/auth/login", {"email": user.email, "password": "pw"}
        )

        self.assertEqual(response.status_code, 401)

    def test_login_returns_access_token_and_user(self):
        response = self.client.post(
            "/api/auth/login", {"email": self.student.email, "password": "pw"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {"access_token", "user"})
        self.assertEqual(response.data["user"], {
            "id": self.student.id,
            "email": self.student.email,
            "role": "STUDENT",
            "is_active": True,
        })

    def test_authenticated_logout_returns_no_content(self):
        login = self.client.post(
            "/api/auth/login", {"email": self.student.email, "password": "pw"}
        )

        response = self.client.post(
            "/api/auth/logout",
            HTTP_AUTHORIZATION=f"Bearer {login.data['access_token']}",
        )

        self.assertEqual(response.status_code, 204)

    def test_token_signed_with_previous_process_secret_is_rejected(self):
        token = AccessToken.for_user(self.student)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            token = TokenBackend(
                algorithm="HS256", signing_key=settings.SECRET_KEY
            ).encode(token.payload)

        response = self.client.get(
            "/api/auth/me", HTTP_AUTHORIZATION=f"Bearer {token}"
        )

        self.assertEqual(response.status_code, 401)

    def test_account_change_writes_audit_row(self):
        self.admin_client.patch(f"/api/users/{self.student.id}", {"is_active": False})

        self.assertEqual(AuditLog.objects.get().action, "account.updated")

    def test_unknown_account_patch_field_is_rejected(self):
        response = self.admin_client.patch(
            f"/api/users/{self.student.id}", {"password": "new-password"}
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(AuditLog.objects.count(), 0)

    def test_noop_account_patch_is_rejected(self):
        response = self.admin_client.patch(
            f"/api/users/{self.student.id}", {"is_active": True}
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(AuditLog.objects.count(), 0)

    def test_teacher_lists_existing_student_accounts_only(self):
        teacher_client = APIClient()
        teacher_client.force_authenticate(
            User.objects.create_user("teacher@example.test", "pw", role="TEACHER")
        )
        User.objects.create_user("other-teacher@example.test", "pw", role="TEACHER")

        response = teacher_client.get("/api/users")

        self.assertEqual(response.status_code, 200)
        self.assertIn(self.student.email, [user["email"] for user in response.data])
        self.assertTrue(all(user["role"] == "STUDENT" for user in response.data))

    def test_account_endpoints_return_auth_and_not_found_statuses(self):
        self.assertEqual(self.client.get("/api/users").status_code, 401)
        self.assertEqual(
            self.admin_client.patch("/api/users/999999", {"is_active": False}).status_code,
            404,
        )
