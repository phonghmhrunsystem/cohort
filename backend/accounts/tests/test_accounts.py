import importlib
import os
from unittest.mock import patch

import hashlib
from datetime import date, timedelta

from django.conf import settings
from django.core.cache import cache
from django.test import TestCase
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import PasswordResetToken, User
from audit.models import AuditLog
from classes.models import Class, Enrollment
from config import settings as project_settings


class AccountLifecycleModelTests(TestCase):
    def test_user_lifecycle_defaults_are_recorded(self):
        user = User.objects.create_user("lifecycle@example.test", "pw", role=User.Role.STUDENT)

        self.assertIsNone(user.hometown)
        self.assertFalse(user.is_deleted)
        self.assertIsNotNone(user.created_at)
        self.assertIsNotNone(user.updated_at)
        for field_name in ("is_deleted", "created_at", "updated_at"):
            self.assertTrue(User._meta.get_field(field_name).db_index)

    def test_password_reset_token_stores_hashed_single_use_lifecycle(self):
        user = User.objects.create_user("reset@example.test", "pw", role=User.Role.STUDENT)
        token = PasswordResetToken.objects.create(
            user=user,
            token_hash="a" * 64,
            expires_at=timezone.now() + timedelta(minutes=30),
        )

        self.assertEqual(token.user, user)
        self.assertIsNotNone(token.created_at)
        self.assertIsNone(token.used_at)
        self.assertTrue(PasswordResetToken._meta.get_field("token_hash").unique)
        self.assertTrue(PasswordResetToken._meta.get_field("expires_at").db_index)

    @override_settings(DJANGO_SECRET_KEY="stable-test-key")
    def test_jwt_key_uses_the_environment_key_after_settings_reload(self):
        with patch.dict(os.environ, {"DJANGO_SECRET_KEY": settings.DJANGO_SECRET_KEY}):
            reloaded_settings = importlib.reload(project_settings)

        self.assertEqual(reloaded_settings.SIMPLE_JWT["SIGNING_KEY"], "stable-test-key")
        importlib.reload(project_settings)


class AccountApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            "admin@example.test", "pw", role="ADMIN"
        )
        self.student = User.objects.create_user(
            "student@example.test", "pw", role="STUDENT"
        )
        self.student_client = APIClient()
        self.student_client.force_authenticate(self.student)
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(self.admin)

    def test_inactive_or_deleted_user_cannot_obtain_token(self):
        inactive = User.objects.create_user(
            "inactive@example.test", "pw", role="STUDENT", is_active=False
        )
        deleted = User.objects.create_user(
            "deleted@example.test", "pw", role="STUDENT", is_deleted=True
        )

        for user in (inactive, deleted):
            with self.subTest(user=user.email):
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

    def test_user_payload_includes_hometown_but_not_deletion_status(self):
        self.student.hometown = "Hanoi"
        self.student.save(update_fields=("hometown",))

        response = self.student_client.get("/api/auth/me")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["hometown"], "Hanoi")
        self.assertNotIn("is_deleted", response.data)

    def test_authenticated_logout_returns_no_content(self):
        login = self.client.post(
            "/api/auth/login", {"email": self.student.email, "password": "pw"}
        )

        response = self.client.post(
            "/api/auth/logout",
            HTTP_AUTHORIZATION=f"Bearer {login.data['access_token']}",
        )

        self.assertEqual(response.status_code, 204)

    def test_forced_user_can_only_use_the_auth_allowlist(self):
        self.student.must_change_password = True
        self.student.save(update_fields=("must_change_password",))

        self.assertEqual(self.student_client.get("/api/auth/me").status_code, 200)
        self.assertEqual(self.student_client.post("/api/auth/logout").status_code, 204)
        self.assertEqual(self.student_client.get("/api/classes").status_code, 403)
        self.assertEqual(self.student_client.get("/api/users").status_code, 403)

    def test_self_profile_patch_persists_allowed_fields_and_writes_safe_audit(self):
        response = self.student_client.patch(
            "/api/auth/me",
            {"full_name": "  Updated Student  ", "phone": "+123456789", "address": "  Hanoi  "},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.student.refresh_from_db()
        self.assertEqual(self.student.full_name, "Updated Student")
        self.assertEqual(self.student.phone, "+123456789")
        self.assertEqual(self.student.address, "Hanoi")
        log = AuditLog.objects.get()
        self.assertEqual(log.action, "account.self_updated")
        self.assertNotIn("password", log.metadata)
        self.assertNotIn("hash", log.metadata)

    def test_self_profile_patch_rejects_identity_state_and_password_fields(self):
        for field, value in (
            ("email", "changed@example.test"),
            ("role", "TEACHER"),
            ("is_active", False),
            ("is_deleted", True),
            ("must_change_password", True),
            ("password", "new-password"),
        ):
            with self.subTest(field=field):
                response = self.student_client.patch("/api/auth/me", {field: value}, format="json")
                self.assertEqual(response.status_code, 422)
                self.assertIn(field, response.data)

        self.student.refresh_from_db()
        self.assertEqual(self.student.email, "student@example.test")
        self.assertEqual(self.student.role, "STUDENT")
        self.assertTrue(self.student.is_active)
        self.assertTrue(self.student.check_password("pw"))
        self.assertEqual(AuditLog.objects.count(), 0)

    def test_self_profile_patch_rejects_invalid_phone_and_date_of_birth(self):
        for field, value in (("phone", "123-456-789"), ("date_of_birth", str(date.today()))):
            with self.subTest(field=field):
                response = self.student_client.patch("/api/auth/me", {field: value}, format="json")
                self.assertEqual(response.status_code, 422)
                self.assertIn(field, response.data)

    def test_change_password_rejects_wrong_current_password_without_changing_hash(self):
        response = self.student_client.post(
            "/api/auth/change-password",
            {
                "current_password": "wrong",
                "new_password": "Password2!",
                "confirm_new_password": "Password2!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("current_password", response.data)
        self.student.refresh_from_db()
        self.assertTrue(self.student.check_password("pw"))
        self.assertEqual(AuditLog.objects.count(), 0)

    def test_change_password_updates_self_and_writes_safe_audit(self):
        response = self.student_client.post(
            "/api/auth/change-password",
            {
                "current_password": "pw",
                "new_password": "Password2!",
                "confirm_new_password": "Password2!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 204)
        self.student.refresh_from_db()
        self.assertTrue(self.student.check_password("Password2!"))
        log = AuditLog.objects.get()
        self.assertEqual(log.action, "account.password_changed")
        self.assertEqual(log.metadata, {})

    def test_change_password_enforces_eight_to_128_character_bounds(self):
        for new_password, expected_status in (
            ("Pass7!!", 422),
            ("x" * 129, 422),
            ("UniquePass42!", 204),
        ):
            with self.subTest(length=len(new_password)):
                response = self.student_client.post(
                    "/api/auth/change-password",
                    {
                        "current_password": "pw",
                        "new_password": new_password,
                        "confirm_new_password": new_password,
                    },
                    format="json",
                )
                self.assertEqual(response.status_code, expected_status)

        self.student.refresh_from_db()
        self.assertTrue(self.student.check_password("UniquePass42!"))

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
                "hometown": None,
                "address": None,
                "is_active": True,
                "must_change_password": False,
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

    def test_forgot_password_always_returns_no_content_without_enumerating_accounts(self):
        cache.clear()
        inactive = User.objects.create_user(
            "inactive@example.test", "pw", role="STUDENT", is_active=False
        )
        deleted = User.objects.create_user(
            "deleted-forgot@example.test", "pw", role="STUDENT", is_deleted=True
        )

        for email in (self.student.email, "none@example.test", inactive.email, deleted.email, self.admin.email):
            with self.subTest(email=email):
                self.assertEqual(
                    self.client.post("/api/auth/forgot-password", {"email": email}, format="json").status_code,
                    204,
                )

        self.assertEqual(PasswordResetToken.objects.filter(user=self.student).count(), 1)

    def test_reset_password_preflight_distinguishes_valid_missing_and_unusable_tokens(self):
        valid = "valid"
        expired = "expired"
        used = "used"
        PasswordResetToken.objects.create(
            user=self.student,
            token_hash=hashlib.sha256(valid.encode()).hexdigest(),
            expires_at=timezone.now() + timedelta(minutes=1),
        )
        PasswordResetToken.objects.create(
            user=self.student,
            token_hash=hashlib.sha256(expired.encode()).hexdigest(),
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        PasswordResetToken.objects.create(
            user=self.student,
            token_hash=hashlib.sha256(used.encode()).hexdigest(),
            expires_at=timezone.now() + timedelta(minutes=1),
            used_at=timezone.now(),
        )

        self.assertEqual(self.client.get(f"/api/auth/reset-password/{valid}").status_code, 204)
        self.assertEqual(self.client.get("/api/auth/reset-password/missing").status_code, 404)
        self.assertEqual(self.client.get(f"/api/auth/reset-password/{expired}").status_code, 410)
        self.assertEqual(self.client.get(f"/api/auth/reset-password/{used}").status_code, 410)

    def test_password_confirmation_mismatch_returns_a_field_error(self):
        response = self.student_client.post(
            "/api/auth/change-password",
            {
                "current_password": "pw",
                "new_password": "Password2!",
                "confirm_new_password": "Different2!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("confirm_new_password", response.data)

    def test_reset_password_consumes_a_valid_token(self):
        token = "reset-token"
        PasswordResetToken.objects.create(
            user=self.student,
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=timezone.now() + timedelta(minutes=1),
        )

        response = self.client.post(
            "/api/auth/reset-password",
            {"token": token, "new_password": "UniquePass42!", "confirm_new_password": "UniquePass42!"},
            format="json",
        )

        self.assertEqual(response.status_code, 204)
        self.student.refresh_from_db()
        self.assertTrue(self.student.check_password("UniquePass42!"))

    def test_legacy_password_reset_queue_routes_are_not_registered(self):
        response = self.client.post("/api/password-reset-requests", {"email": self.student.email}, format="json")

        self.assertEqual(response.status_code, 404)
