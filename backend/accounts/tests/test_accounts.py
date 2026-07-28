import importlib
from unittest.mock import patch

from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.backends import TokenBackend
from rest_framework_simplejwt.tokens import AccessToken

from accounts.models import User
from audit.models import AuditLog
from classes.models import Class, Enrollment
from config import settings as project_settings


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
        self.assertEqual(response.data["user"]["email"], self.student.email)
        self.assertEqual(response.data["user"]["role"], "STUDENT")

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
        previous_jwt_signing_key = project_settings.JWT_SIGNING_KEY
        token = AccessToken.for_user(self.student)
        token = TokenBackend(
            algorithm="HS256", signing_key=previous_jwt_signing_key
        ).encode(token.payload)
        current_jwt_signing_key = importlib.reload(project_settings).JWT_SIGNING_KEY
        self.assertNotEqual(previous_jwt_signing_key, current_jwt_signing_key)

        with patch(
            "rest_framework_simplejwt.state.token_backend",
            TokenBackend(algorithm="HS256", signing_key=current_jwt_signing_key),
        ):
            response = self.client.get(
                "/api/auth/me", HTTP_AUTHORIZATION=f"Bearer {token}"
            )

        self.assertEqual(response.status_code, 401)

    def test_account_change_writes_audit_row(self):
        response = self.admin_client.patch(f"/api/users/{self.student.id}", {"full_name": "Updated Student"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(AuditLog.objects.get().action, "account.updated")

    def test_unknown_account_patch_field_is_rejected(self):
        response = self.admin_client.patch(
            f"/api/users/{self.student.id}", {"password": "new-password"}
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(AuditLog.objects.count(), 0)

    def test_noop_account_patch_is_rejected(self):
        response = self.admin_client.patch(
            f"/api/users/{self.student.id}", {"email": self.student.email}
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(AuditLog.objects.count(), 0)

    def test_teacher_cannot_list_accounts(self):
        teacher_client = APIClient()
        teacher_client.force_authenticate(
            User.objects.create_user("teacher@example.test", "pw", role="TEACHER")
        )
        response = teacher_client.get("/api/users")

        self.assertEqual(response.status_code, 403)

    def test_account_endpoints_return_auth_and_not_found_statuses(self):
        self.assertEqual(self.client.get("/api/users").status_code, 401)
        self.assertEqual(
            self.admin_client.patch("/api/users/999999", {"full_name": "Updated"}).status_code,
            404,
        )

    def test_create_trims_profile_lowercases_email_and_accepts_boundary_values(self):
        response = self.admin_client.post(
            "/api/users",
            {
                "full_name": "  AB  ",
                "email": "NEW@EXAMPLE.TEST ",
                "password": "password",
                "role": "TEACHER",
                "phone": "+123456789",
                "date_of_birth": str(date.today() - timedelta(days=1)),
                "gender": "NAM",
                "address": "  A" + "x" * 253 + "  ",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data.get("full_name"), "AB")
        self.assertEqual(response.data.get("email"), "new@example.test")
        self.assertEqual(response.data.get("address"), "A" + "x" * 253)
        self.assertTrue(User.objects.get(email="new@example.test").check_password("password"))

    def test_create_rejects_trimmed_profile_and_password_bounds(self):
        response = self.admin_client.post(
            "/api/users",
            {"full_name": " A ", "email": "new@example.test", "password": "short", "role": "TEACHER"},
            format="json",
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("full_name", response.data)
        self.assertIn("password", response.data)

    def test_create_rejects_invalid_profile_formats_and_upper_bounds(self):
        payload = {"full_name": "Valid User", "email": "new@example.test", "password": "password", "role": "TEACHER"}
        cases = (
            ("phone", "12345678"),
            ("phone", "+1234567890123456"),
            ("phone", "123-456-789"),
            ("date_of_birth", str(date.today())),
            ("date_of_birth", str(date.today() + timedelta(days=1))),
            ("gender", "OTHER"),
            ("address", "x" * 256),
            ("full_name", "x" * 101),
            ("password", "x" * 129),
        )

        for field, value in cases:
            with self.subTest(field=field, value=value):
                response = self.admin_client.post(
                    "/api/users", {**payload, field: value}, format="json"
                )
                self.assertEqual(response.status_code, 422)
                self.assertIn(field, response.data)

    def test_email_is_unique_without_regard_to_case(self):
        User.objects.create_user("case@example.test", "pw", role="TEACHER")

        response = self.admin_client.post(
            "/api/users",
            {"full_name": "Case User", "email": "CASE@EXAMPLE.TEST", "password": "password", "role": "STUDENT"},
            format="json",
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("email", response.data)

    def test_create_rejects_admin_role(self):
        response = self.admin_client.post(
            "/api/users",
            {"full_name": "Admin User", "email": "new@example.test", "password": "password", "role": "ADMIN"},
            format="json",
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("role", response.data)

    def test_list_returns_active_teacher_and_student_matches_query_and_role(self):
        teacher = User.objects.create_user("ada.teacher@example.test", "pw", role="TEACHER")
        User.objects.create_user("ada.inactive@example.test", "pw", role="STUDENT", is_active=False)

        response = self.admin_client.get("/api/users", {"q": "ADA", "role": "TEACHER"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [
            {
                "id": teacher.id,
                "full_name": None,
                "email": "ada.teacher@example.test",
                "role": "TEACHER",
                "phone": None,
                "date_of_birth": None,
                "gender": None,
                "address": None,
                "is_active": True,
            }
        ])

    def test_list_excludes_admin_and_inactive_accounts(self):
        inactive = User.objects.create_user("inactive@example.test", "pw", role="STUDENT", is_active=False)

        response = self.admin_client.get("/api/users")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn(self.admin.id, [user["id"] for user in response.data])
        self.assertNotIn(inactive.id, [user["id"] for user in response.data])

    def test_inactive_account_is_unavailable_for_mutation(self):
        inactive = User.objects.create_user("inactive@example.test", "pw", role="STUDENT", is_active=False)

        self.assertEqual(
            self.admin_client.patch(f"/api/users/{inactive.id}", {"full_name": "Changed"}).status_code,
            404,
        )
        self.assertEqual(self.admin_client.delete(f"/api/users/{inactive.id}").status_code, 404)

    def test_patch_rejects_immutable_email_and_role(self):
        response = self.admin_client.patch(
            f"/api/users/{self.student.id}", {"email": "changed@example.test", "role": "TEACHER"}, format="json"
        )

        self.assertEqual(response.status_code, 422)
        self.student.refresh_from_db()
        self.assertEqual(self.student.email, "student@example.test")
        self.assertEqual(self.student.role, "STUDENT")

    def test_patch_rejects_new_password(self):
        response = self.admin_client.patch(
            f"/api/users/{self.student.id}", {"new_password": "new-password"}, format="json"
        )

        self.assertEqual(response.status_code, 422)
        self.student.refresh_from_db()
        self.assertTrue(self.student.check_password("pw"))
        self.assertEqual(AuditLog.objects.count(), 0)

    def test_admin_account_is_unavailable_for_mutation(self):
        response = self.admin_client.patch(
            f"/api/users/{self.admin.id}", {"full_name": "Changed Admin"}, format="json"
        )

        self.assertEqual(response.status_code, 404)

    def test_delete_soft_deactivates_active_account_and_writes_audit(self):
        response = self.admin_client.delete(f"/api/users/{self.student.id}")

        self.assertEqual(response.status_code, 204)
        self.student.refresh_from_db()
        self.assertFalse(self.student.is_active)
        self.assertEqual(AuditLog.objects.get().action, "account.deactivated")

    def test_delete_rejects_teacher_assigned_to_a_class(self):
        teacher = User.objects.create_user("teacher@example.test", "pw", role="TEACHER")
        Class.objects.create(teacher=teacher, name="Class", starts_at=timezone.now(), ends_at=timezone.now() + timedelta(days=1))

        response = self.admin_client.delete(f"/api/users/{teacher.id}")

        self.assertEqual(response.status_code, 422)
        self.assertTrue(User.objects.get(id=teacher.id).is_active)

    def test_delete_rejects_student_enrolled_in_a_class(self):
        teacher = User.objects.create_user("teacher@example.test", "pw", role="TEACHER")
        class_ = Class.objects.create(teacher=teacher, name="Class", starts_at=timezone.now(), ends_at=timezone.now() + timedelta(days=1))
        Enrollment.objects.create(classroom=class_, student=self.student)

        response = self.admin_client.delete(f"/api/users/{self.student.id}")

        self.assertEqual(response.status_code, 422)
        self.assertTrue(User.objects.get(id=self.student.id).is_active)
