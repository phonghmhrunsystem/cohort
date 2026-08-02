import ast
from pathlib import Path

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditLog
from audit.services import safe_metadata

BACKEND_ROOT = Path(__file__).resolve().parents[2]
EXPECTED_ACTIONS = {
    "account.created", "account.updated", "account.self_updated", "account.deactivated",
    "account.reactivated", "account.deleted", "account.password_changed", "account.password_set",
    "class.created", "class.updated", "class.status_changed", "class.reopened", "class.teacher_changed",
    "enrollment.created", "enrollment.replaced", "enrollment.removed",
    "assignment.created", "assignment.updated", "assignment.rubric.updated",
    "submission.created", "grade.created",
    "class_resource.created",
}


class AuditActionInventoryTests(TestCase):
    """Bảng action trong docs/overview/08-audit-log.md §4 là hợp đồng với UI:
    mỗi mã ở đây phải có một câu tiếng Việt tương ứng ở frontend."""

    def test_the_code_writes_exactly_the_documented_actions(self):
        found = set()
        for path in BACKEND_ROOT.rglob("*.py"):
            if "tests" in path.parts or "migrations" in path.parts:
                continue
            for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
                if not (isinstance(node, ast.Call) and getattr(node.func, "id", None) == "write_audit"):
                    continue
                for keyword in node.keywords:
                    if keyword.arg != "action":
                        continue
                    # Đi vào cả biểu thức: hai call site dùng `A if cond else B`
                    # (account.reactivated/deactivated, class.reopened/updated),
                    # nên bắt theo chuỗi literal chứ không theo dạng cú pháp.
                    found.update(
                        child.value for child in ast.walk(keyword.value)
                        if isinstance(child, ast.Constant) and isinstance(child.value, str)
                    )
        self.assertEqual(found, EXPECTED_ACTIONS)


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

        self.assertEqual(metadata, {})

    def test_metadata_rejects_root_scalars_and_neutral_key_secrets(self):
        self.assertEqual(safe_metadata("RawPassword123!"), {})
        self.assertEqual(
            safe_metadata({"value": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.signature", "count": 1}),
            {"count": 1},
        )

    def test_audit_logs_require_an_admin(self):
        client = APIClient()
        self.assertEqual(client.get("/api/audit-logs").status_code, 401)

        client.force_authenticate(self.teacher)
        self.assertEqual(client.get("/api/audit-logs").status_code, 403)

        client.force_authenticate(self.admin)
        response = client.get("/api/audit-logs")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["id"], self.log.id)

    def test_audit_api_scrubs_preexisting_sensitive_metadata_and_shows_actor_display_data(self):
        log = AuditLog.objects.create(
            actor=self.admin,
            action="account.updated",
            target_type="accounts.user",
            target_id=self.teacher.id,
            metadata={
            "password": "secret",
            "file": "raw file data",
            "relative_path": "uploads/report.pdf",
            "safe": 1,
            },
        )
        client = APIClient()
        client.force_authenticate(self.admin)

        response = client.get("/api/audit-logs")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["metadata"], {"safe": 1})
        self.assertEqual(response.data[0]["actor"], {"id": self.admin.id, "full_name": None, "email": self.admin.email})
