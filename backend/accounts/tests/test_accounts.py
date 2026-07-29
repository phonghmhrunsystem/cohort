import importlib
import os
from pathlib import Path
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

    def test_list_is_paginated_and_sorted_by_latest_update_then_id(self):
        users = [
            User.objects.create_user(f"user-{index}@example.test", "pw", role="STUDENT")
            for index in range(12)
        ]
        same_update = timezone.now() - timedelta(days=1)
        User.objects.filter(id__in=[user.id for user in users]).update(updated_at=same_update)
        newest = users[3]
        User.objects.filter(id=newest.id).update(updated_at=timezone.now())

        response = self.admin_client.get("/api/users", {"q": "user-"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 12)
        self.assertIsNotNone(response.data["next"])
        self.assertIsNone(response.data["previous"])
        self.assertEqual(len(response.data["results"]), 10)
        expected = [
            newest.id,
            *sorted(({user.id for user in users} - {newest.id}), reverse=True)[:9],
        ]
        self.assertEqual([user["id"] for user in response.data["results"]], expected)
        page_two = self.admin_client.get("/api/users", {"q": "user-", "page": 2})
        self.assertIsNotNone(page_two.data["previous"])
        self.assertIsNone(page_two.data["next"])

    def test_list_filters_query_role_and_inclusive_created_updated_dates(self):
        teacher = User.objects.create_user("ada.teacher@example.test", "pw", role="TEACHER")
        other = User.objects.create_user("ada.student@example.test", "pw", role="STUDENT")
        included = timezone.now() - timedelta(days=2)
        excluded = timezone.now() - timedelta(days=4)
        User.objects.filter(id=teacher.id).update(created_at=included, updated_at=included)
        User.objects.filter(id=other.id).update(created_at=excluded, updated_at=excluded)

        day = included.date().isoformat()
        response = self.admin_client.get("/api/users", {
            "q": "ADA",
            "role": "TEACHER",
            "created_from": day,
            "created_to": day,
            "updated_from": day,
            "updated_to": day,
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual([user["id"] for user in response.data["results"]], [teacher.id])

    def test_list_rejects_invalid_or_reversed_date_pairs_with_field_errors(self):
        response = self.admin_client.get("/api/users", {
            "created_from": "not-a-date",
            "created_to": "2026-07-29",
        })
        self.assertEqual(response.status_code, 422)
        self.assertIn("created_from", response.data)

        response = self.admin_client.get("/api/users", {
            "updated_from": "2026-07-30",
            "updated_to": "2026-07-29",
        })
        self.assertEqual(response.status_code, 422)
        self.assertIn("updated_to", response.data)

    def test_list_includes_disabled_but_excludes_admin_and_deleted_accounts(self):
        inactive = User.objects.create_user("inactive@example.test", "pw", role="STUDENT", is_active=False)
        deleted = User.objects.create_user(
            "deleted@example.test", "pw", role="STUDENT", is_deleted=True
        )

        response = self.admin_client.get("/api/users")

        self.assertEqual(response.status_code, 200)
        ids = [user["id"] for user in response.data["results"]]
        self.assertIn(inactive.id, ids)
        self.assertNotIn(self.admin.id, ids)
        self.assertNotIn(deleted.id, ids)

    def test_disabled_account_is_viewable_editable_and_re_enabled(self):
        inactive = User.objects.create_user("inactive@example.test", "pw", role="STUDENT", is_active=False)

        detail = self.admin_client.get(f"/api/users/{inactive.id}")
        edited = self.admin_client.patch(
            f"/api/users/{inactive.id}", {"full_name": "Changed"}, format="json"
        )
        enabled = self.admin_client.patch(
            f"/api/users/{inactive.id}/status", {"is_active": True}, format="json"
        )

        self.assertEqual(detail.status_code, 200)
        self.assertEqual(edited.status_code, 200)
        self.assertEqual(enabled.status_code, 200)
        inactive.refresh_from_db()
        self.assertEqual(inactive.full_name, "Changed")
        self.assertTrue(inactive.is_active)
        self.assertEqual(
            list(AuditLog.objects.order_by("id").values_list("action", flat=True)),
            ["account.updated", "account.reactivated"],
        )

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

    def test_deleted_and_admin_accounts_are_out_of_scope_for_every_detail_route(self):
        deleted = User.objects.create_user(
            "deleted@example.test", "pw", role="STUDENT", is_deleted=True
        )
        for user in (self.admin, deleted):
            for method, suffix, data in (
                ("get", "", None),
                ("patch", "", {"full_name": "Changed"}),
                ("patch", "/status", {"is_active": False}),
                ("post", "/reset-password", {
                    "new_password": "Password2!",
                    "confirm_new_password": "Password2!",
                }),
                ("delete", "", None),
            ):
                with self.subTest(user=user.id, method=method, suffix=suffix):
                    response = getattr(self.admin_client, method)(
                        f"/api/users/{user.id}{suffix}", data=data, format="json"
                    )
                    self.assertEqual(response.status_code, 404)

    def test_create_forces_password_change_and_writes_safe_audit_metadata(self):
        response = self.admin_client.post("/api/users", {
            "full_name": "New Student",
            "email": "new-student@example.test",
            "password": "Password2!",
            "role": "STUDENT",
        }, format="json")

        self.assertEqual(response.status_code, 201)
        user = User.objects.get(id=response.data["id"])
        self.assertTrue(user.must_change_password)
        audit = AuditLog.objects.get()
        self.assertEqual(audit.action, "account.created")
        self.assertEqual(audit.metadata["user_id"], user.id)
        self.assertTrue(all(not isinstance(value, str) for value in audit.metadata.values()))

    def test_status_and_direct_password_reset_write_distinct_audits(self):
        disabled = self.admin_client.patch(
            f"/api/users/{self.student.id}/status", {"is_active": False}, format="json"
        )
        reset = self.admin_client.post(
            f"/api/users/{self.student.id}/reset-password",
            {
                "new_password": "Password2!",
                "confirm_new_password": "Password2!",
            },
            format="json",
        )

        self.assertEqual(disabled.status_code, 200)
        self.assertEqual(reset.status_code, 200)
        self.student.refresh_from_db()
        self.assertFalse(self.student.is_active)
        self.assertTrue(self.student.must_change_password)
        self.assertTrue(self.student.check_password("Password2!"))
        self.assertEqual(
            list(AuditLog.objects.order_by("id").values_list("action", flat=True)),
            ["account.deactivated", "account.password_set"],
        )
        self.assertTrue(all(
            "password" not in key.lower()
            for audit in AuditLog.objects.all()
            for key in audit.metadata
        ))

    def test_account_lifecycle_mutations_refresh_updated_at(self):
        stale = timezone.now() - timedelta(days=1)
        User.objects.filter(id=self.student.id).update(updated_at=stale)

        self.admin_client.patch(
            f"/api/users/{self.student.id}/status", {"is_active": False}, format="json"
        )
        self.student.refresh_from_db()
        self.assertGreater(self.student.updated_at, stale)

        User.objects.filter(id=self.student.id).update(updated_at=stale)
        self.admin_client.post(
            f"/api/users/{self.student.id}/reset-password",
            {"new_password": "Password2!", "confirm_new_password": "Password2!"},
            format="json",
        )
        self.student.refresh_from_db()
        self.assertGreater(self.student.updated_at, stale)

        User.objects.filter(id=self.student.id).update(updated_at=stale)
        self.admin_client.delete(f"/api/users/{self.student.id}")
        self.student.refresh_from_db()
        self.assertGreater(self.student.updated_at, stale)

    def test_delete_soft_deletes_and_deactivates_account_with_deleted_audit(self):
        response = self.admin_client.delete(f"/api/users/{self.student.id}")

        self.assertEqual(response.status_code, 204)
        self.student.refresh_from_db()
        self.assertFalse(self.student.is_active)
        self.assertTrue(self.student.is_deleted)
        self.assertEqual(AuditLog.objects.get().action, "account.deleted")

    def test_active_class_blocks_disable_and_delete(self):
        teacher = User.objects.create_user("teacher@example.test", "pw", role="TEACHER")
        Class.objects.create(teacher=teacher, name="Class", starts_at=timezone.now(), ends_at=timezone.now() + timedelta(days=1))
        Enrollment.objects.create(
            classroom=teacher.classes.get(),
            student=self.student,
        )

        disable = self.admin_client.patch(
            f"/api/users/{teacher.id}/status", {"is_active": False}, format="json"
        )
        delete = self.admin_client.delete(f"/api/users/{self.student.id}")

        self.assertEqual(disable.status_code, 422)
        self.assertIn("active Class", disable.data["detail"])
        self.assertEqual(delete.status_code, 422)
        self.assertIn("active Class", delete.data["detail"])
        self.assertTrue(User.objects.get(id=teacher.id).is_active)

    def test_ended_or_disabled_class_does_not_block_account_operations(self):
        ended_teacher = User.objects.create_user("ended-teacher@example.test", "pw", role="TEACHER")
        Class.objects.create(
            teacher=ended_teacher,
            name="Ended",
            starts_at=timezone.now() - timedelta(days=2),
            ends_at=timezone.now() - timedelta(days=1),
        )
        disabled_teacher = User.objects.create_user("disabled-teacher@example.test", "pw", role="TEACHER")
        Class.objects.create(
            teacher=disabled_teacher,
            name="Disabled",
            starts_at=timezone.now(),
            ends_at=timezone.now() + timedelta(days=1),
            is_active=False,
        )

        self.assertEqual(self.admin_client.delete(f"/api/users/{ended_teacher.id}").status_code, 204)
        self.assertEqual(
            self.admin_client.patch(
                f"/api/users/{disabled_teacher.id}/status",
                {"is_active": False},
                format="json",
            ).status_code,
            200,
        )

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

    def test_legacy_queue_has_no_runtime_reference(self):
        files = (
            file
            for file in Path(settings.BASE_DIR / "accounts").glob("**/*.py")
            if not {"migrations", "tests"}.intersection(file.parts)
        )
        self.assertFalse(any("PasswordResetRequest" in file.read_text() for file in files))
