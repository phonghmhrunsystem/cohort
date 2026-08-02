import ast
from datetime import timedelta
from pathlib import Path

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from assignments.models import Assignment
from audit.models import AuditLog
from audit.services import safe_metadata
from classes.models import Class, ClassResource

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
        self.assertEqual(response.data["results"][0]["id"], self.log.id)

    def test_the_log_is_paginated_newest_first(self):
        for index in range(24):
            AuditLog.objects.create(actor=self.admin, action="account.updated",
                                    target_type="accounts.user", target_id=self.teacher.id,
                                    metadata={"index": index})
        client = APIClient()
        client.force_authenticate(self.admin)

        first = client.get("/api/audit-logs")
        last = client.get("/api/audit-logs", {"page": 3})

        self.assertEqual(first.data["count"], 25)
        self.assertEqual(len(first.data["results"]), 10)
        self.assertIsNotNone(first.data["next"])
        self.assertIsNone(first.data["previous"])
        self.assertEqual(first.data["results"][0]["metadata"], {"index": 23})
        # Trang cuối là phần đuôi cũ nhất: dòng của setUp đóng đuôi danh sách.
        self.assertEqual(len(last.data["results"]), 5)
        self.assertIsNone(last.data["next"])
        self.assertEqual(last.data["results"][-1]["id"], self.log.id)

    def test_a_page_past_the_end_is_a_404_not_an_empty_page(self):
        client = APIClient()
        client.force_authenticate(self.admin)

        self.assertEqual(client.get("/api/audit-logs", {"page": 9}).status_code, 404)

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
        self.assertEqual(response.data["results"][0]["metadata"], {"safe": 1})
        self.assertEqual(response.data["results"][0]["actor"],
                         {"id": self.admin.id, "full_name": None, "email": self.admin.email})


class TargetLabelTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user("admin2@example.test", "pw", role="ADMIN")
        self.teacher = User.objects.create_user("teacher2@example.test", "pw", role="TEACHER")
        self.teacher.full_name = "Pham Thu Hoa"; self.teacher.save(update_fields=("full_name",))
        self.student = User.objects.create_user("student2@example.test", "pw", role="STUDENT")
        self.student.full_name = "Tran Minh Anh"; self.student.save(update_fields=("full_name",))
        self.class_ = Class.objects.create(
            name="Web Development K18A", teacher=self.teacher,
            starts_at=timezone.now(), ends_at=timezone.now() + timedelta(days=30),
        )
        self.assignment = Assignment.objects.create(
            classroom=self.class_, title="Lab 3", description="Responsive layout",
            due_at=timezone.now() + timedelta(days=7),
        )
        self.client = APIClient()

    def labels(self):
        self.client.force_authenticate(user=self.admin)
        return {row["action"]: row["target_label"] for row in self.client.get("/api/audit-logs").data["results"]}

    def test_an_account_row_names_the_user_and_their_role(self):
        AuditLog.objects.create(actor=self.admin, action="account.created",
                                target_type="accounts.user", target_id=self.student.id, metadata={})
        self.assertEqual(self.labels()["account.created"], "Student Tran Minh Anh")

    def test_a_class_row_names_the_class(self):
        AuditLog.objects.create(actor=self.admin, action="class.created",
                                target_type="classes.class", target_id=self.class_.id, metadata={})
        self.assertEqual(self.labels()["class.created"], "Web Development K18A")

    def test_a_removed_enrollment_resolves_from_metadata_not_the_deleted_row(self):
        AuditLog.objects.create(
            actor=self.admin, action="enrollment.removed", target_type="classes.enrollment",
            target_id=99999, metadata={"class_id": self.class_.id, "student_id": self.student.id},
        )
        self.assertEqual(self.labels()["enrollment.removed"], "Web Development K18A · Tran Minh Anh")

    def test_a_grade_row_carries_the_assignment_student_and_score(self):
        AuditLog.objects.create(
            actor=self.teacher, action="grade.created", target_type="grading.grade", target_id=1,
            metadata={"assignment_id": self.assignment.id, "student_id": self.student.id,
                      "submission_id": 1, "total_score": 85},
        )
        self.assertEqual(self.labels()["grade.created"], "Lab 3 · Tran Minh Anh · 85")

    def test_a_submission_row_names_the_assignment_and_student(self):
        AuditLog.objects.create(
            actor=self.student, action="submission.created", target_type="submissions.submission",
            target_id=1, metadata={"assignment_id": self.assignment.id, "student_id": self.student.id, "version": 2},
        )
        self.assertEqual(self.labels()["submission.created"], "Lab 3 · Tran Minh Anh")

    def test_a_resource_row_names_the_resource(self):
        resource = ClassResource.objects.create(classroom=self.class_, title="Slide deck", url="https://example.test/s")
        AuditLog.objects.create(
            actor=self.teacher, action="class_resource.created", target_type="classes.classresource",
            target_id=resource.id, metadata={"class_id": self.class_.id, "resource_id": resource.id},
        )
        self.assertEqual(self.labels()["class_resource.created"], "Slide deck")

    def test_an_unresolvable_target_yields_an_empty_label_not_an_error(self):
        AuditLog.objects.create(actor=self.admin, action="class.created",
                                target_type="classes.class", target_id=424242, metadata={})
        self.assertEqual(self.labels()["class.created"], "")

    def test_the_label_pass_does_not_scale_its_query_count_with_the_row_count(self):
        for index in range(20):
            AuditLog.objects.create(actor=self.admin, action="account.created",
                                    target_type="accounts.user", target_id=self.student.id,
                                    metadata={"index": index})
        self.client.force_authenticate(user=self.admin)
        # 1 (COUNT của paginator) + 1 (logs + actor qua select_related) + 1 (bảng
        # user). Ba truy vấn nhãn còn lại không chạy vì không có id nào để tra.
        # Điều được chốt ở đây là hằng số: thêm 20 dòng nữa cũng không làm nó tăng.
        with self.assertNumQueries(3):
            self.client.get("/api/audit-logs")
