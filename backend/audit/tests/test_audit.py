from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditLog
from audit.services import safe_metadata


class AuditTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user("admin@example.test", "pw", role="ADMIN")
        self.teacher = User.objects.create_user("teacher@example.test", "pw", role="TEACHER")
        self.log = AuditLog.objects.create(
            actor=self.admin,
            action="account.created",
            target_type="accounts.user",
            target_id=self.teacher.id,
            metadata={"email": self.teacher.email},
        )

    def test_bulk_update_cannot_mutate_audit_rows(self):
        with self.assertRaises(RuntimeError):
            AuditLog.objects.filter(id=self.log.id).update(action="changed")

        self.log.refresh_from_db()
        self.assertEqual(self.log.action, "account.created")

    def test_bulk_delete_cannot_remove_audit_rows(self):
        with self.assertRaises(RuntimeError):
            AuditLog.objects.filter(id=self.log.id).delete()

        self.assertTrue(AuditLog.objects.filter(id=self.log.id).exists())

    def test_bulk_upsert_cannot_mutate_an_audit_row(self):
        replacement = AuditLog(
            id=self.log.id,
            actor=self.admin,
            action="changed",
            target_type=self.log.target_type,
            target_id=self.log.target_id,
            metadata=self.log.metadata,
        )

        with self.assertRaises(RuntimeError):
            AuditLog.objects.bulk_create(
                [replacement], update_conflicts=True, update_fields=["action"], unique_fields=["id"]
            )

        self.log.refresh_from_db()
        self.assertEqual(self.log.action, "account.created")

    def test_metadata_excludes_sensitive_values(self):
        metadata = safe_metadata(
            {
                "password": "secret",
                "password_hash": "hash",
                "hash": "hash",
                "access_token": "token",
                "bytes": b"content",
                "posix_path": "/private/report.pdf",
                "windows_path": r"C:\\private\\report.pdf",
                "relative_path": "uploads/report.pdf",
            }
        )

        self.assertEqual(metadata, {"relative_path": "uploads/report.pdf"})

    def test_audit_logs_require_an_admin(self):
        client = APIClient()
        self.assertEqual(client.get("/api/audit-logs").status_code, 401)

        client.force_authenticate(self.teacher)
        self.assertEqual(client.get("/api/audit-logs").status_code, 403)

        client.force_authenticate(self.admin)
        response = client.get("/api/audit-logs")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["id"], self.log.id)
