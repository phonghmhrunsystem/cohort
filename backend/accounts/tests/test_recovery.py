import base64
import hashlib
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.mail import send_password_reset_email
from accounts.models import PasswordResetToken, User
from accounts.services import (
    consume_reset_token,
    has_active_class,
    issue_reset_token,
    manageable_users,
)
from accounts.throttling import allow_password_reset
from audit.models import AuditLog
from classes.models import Class, Enrollment


class RecoveryServiceTests(TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user("teacher@example.test", "password", role=User.Role.TEACHER)
        self.student = User.objects.create_user("student@example.test", "password", role=User.Role.STUDENT)

    def test_manageable_users_excludes_admin_and_deleted_accounts(self):
        admin = User.objects.create_user("admin@example.test", "password", role=User.Role.ADMIN)
        deleted = User.objects.create_user("deleted@example.test", "password", role=User.Role.STUDENT, is_deleted=True)

        users = manageable_users()
        self.assertIn(self.teacher.id, users.values_list("id", flat=True))
        self.assertIn(self.student.id, users.values_list("id", flat=True))
        self.assertNotIn(admin.id, users.values_list("id", flat=True))
        self.assertNotIn(deleted.id, users.values_list("id", flat=True))

    def test_has_active_class_requires_enabled_class_with_future_end(self):
        now = timezone.now()
        Class.objects.create(teacher=self.teacher, name="Current", starts_at=now, ends_at=now + timedelta(days=1))
        student_class = Class.objects.create(teacher=self.teacher, name="Student", starts_at=now, ends_at=now + timedelta(days=1))
        Enrollment.objects.create(classroom=student_class, student=self.student)
        Class.objects.create(teacher=self.teacher, name="Disabled", starts_at=now, ends_at=now + timedelta(days=1), is_active=False)
        Class.objects.create(teacher=self.teacher, name="Ended", starts_at=now - timedelta(days=2), ends_at=now - timedelta(days=1))

        self.assertTrue(has_active_class(self.teacher))
        self.assertTrue(has_active_class(self.student))

    def test_has_active_class_ignores_disabled_and_ended_classes(self):
        now = timezone.now()
        disabled_teacher = User.objects.create_user("disabled-teacher@example.test", "password", role=User.Role.TEACHER)
        ended_student = User.objects.create_user("ended-student@example.test", "password", role=User.Role.STUDENT)
        Class.objects.create(
            teacher=disabled_teacher,
            name="Disabled",
            starts_at=now,
            ends_at=now + timedelta(days=1),
            is_active=False,
        )
        ended = Class.objects.create(
            teacher=self.teacher,
            name="Ended",
            starts_at=now - timedelta(days=2),
            ends_at=now - timedelta(days=1),
        )
        Enrollment.objects.create(classroom=ended, student=ended_student)

        self.assertFalse(has_active_class(disabled_teacher))
        self.assertFalse(has_active_class(ended_student))

    def test_issued_token_is_32_byte_urlsafe_and_only_its_sha256_is_stored(self):
        raw = issue_reset_token(self.student)

        self.assertEqual(len(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))), 32)
        self.assertFalse(PasswordResetToken.objects.filter(token_hash=raw).exists())
        self.assertTrue(
            PasswordResetToken.objects.filter(token_hash=hashlib.sha256(raw.encode()).hexdigest()).exists()
        )

    def test_issuing_a_token_invalidates_the_previous_usable_token(self):
        first = issue_reset_token(self.student)
        second = issue_reset_token(self.student)

        first_token = PasswordResetToken.objects.get(token_hash=hashlib.sha256(first.encode()).hexdigest())
        self.assertIsNotNone(first_token.used_at)
        self.assertEqual(consume_reset_token(first, "Password123!", "Password123!"), "used")
        self.assertEqual(consume_reset_token(second, "Password123!", "Password123!"), "ok")

    def test_consumption_reports_unknown_expired_and_used_tokens(self):
        self.assertEqual(consume_reset_token("unknown", "Password123!", "Password123!"), "unknown")

        expired_raw = "expired"
        PasswordResetToken.objects.create(
            user=self.student,
            token_hash=hashlib.sha256(expired_raw.encode()).hexdigest(),
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        self.assertEqual(consume_reset_token(expired_raw, "Password123!", "Password123!"), "expired")

        raw = issue_reset_token(self.student)
        self.assertEqual(consume_reset_token(raw, "Password123!", "Password123!"), "ok")
        self.assertEqual(consume_reset_token(raw, "Another123!", "Another123!"), "used")

    def test_consumption_changes_password_once_and_writes_a_safe_audit_row(self):
        raw = issue_reset_token(self.student)

        self.assertEqual(consume_reset_token(raw, "Password123!", "Password123!"), "ok")
        self.student.refresh_from_db()
        self.assertTrue(self.student.check_password("Password123!"))
        audit = AuditLog.objects.get()
        self.assertEqual(audit.action, "account.password_changed")
        self.assertEqual(audit.metadata, {})

    def test_reset_email_contains_one_reset_link_with_the_raw_token(self):
        raw = issue_reset_token(self.student)

        with self.captureOnCommitCallbacks(execute=True):
            send_password_reset_email(self.student, raw)

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.student.email])
        link = mail.outbox[0].body.split()[-1]
        self.assertEqual(urlparse(link).path, "/reset-password")
        self.assertEqual(parse_qs(urlparse(link).query), {"token": [raw]})


class PasswordResetThrottleTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_email_is_limited_to_one_request_per_minute(self):
        self.assertTrue(allow_password_reset(" Student@Example.Test ", "127.0.0.1"))
        self.assertFalse(allow_password_reset("student@example.test", "127.0.0.2"))

    def test_ip_is_limited_to_five_requests_per_hour(self):
        for number in range(5):
            self.assertTrue(allow_password_reset(f"student{number}@example.test", "127.0.0.1"))
        self.assertFalse(allow_password_reset("another@example.test", "127.0.0.1"))
