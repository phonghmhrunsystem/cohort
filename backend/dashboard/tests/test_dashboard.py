from datetime import timedelta

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from assignments.models import Assignment, AssignmentGrade
from audit.models import AuditLog
from classes.models import Class, Enrollment
from grading.models import Grade
from submissions.models import Submission


def make_submission(assignment, student, version=1):
    return Submission.objects.create(
        assignment=assignment, student=student, version=version,
        file_path=f"x/{assignment.id}-{student.id}-{version}.pdf",
        original_filename="work.pdf", content_type="application/pdf", size=10,
    )


class DashboardAccessTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user("dash-admin@example.test", "pw", role="ADMIN")
        self.teacher = User.objects.create_user("dash-teacher@example.test", "pw", role="TEACHER")
        self.student = User.objects.create_user("dash-student@example.test", "pw", role="STUDENT")

    def test_anonymous_is_rejected(self):
        self.assertEqual(self.client.get("/api/dashboard").status_code, 401)

    def test_each_role_gets_its_own_shape_marker(self):
        for user, role in ((self.admin, "ADMIN"), (self.teacher, "TEACHER"), (self.student, "STUDENT")):
            self.client.force_authenticate(user)
            response = self.client.get("/api/dashboard")

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["role"], role)

    def test_a_forced_password_change_blocks_the_dashboard(self):
        self.student.must_change_password = True
        self.student.save()
        self.client.force_authenticate(self.student)

        self.assertEqual(self.client.get("/api/dashboard").status_code, 403)

    def test_the_payload_shape_is_not_selectable_by_query_param(self):
        """Một Teacher không được xin payload của Admin."""
        self.client.force_authenticate(self.teacher)

        response = self.client.get("/api/dashboard?role=ADMIN")

        self.assertEqual(response.data["role"], "TEACHER")


class AdminAccountCountTests(TestCase):
    """Migration `accounts.0002_seed_demo_data` gieo sẵn một roster demo vào DB
    test, nên mọi khẳng định ở đây là **delta** so với nền đó — con số tuyệt đối
    sẽ đỏ ngay lần đầu ai đó thêm một dòng vào roster."""

    def setUp(self):
        self.client = APIClient()
        self.baseline = {
            key: User.objects.filter(role=role, is_deleted=False).count()
            for key, role in (("admins", "ADMIN"), ("teachers", "TEACHER"), ("students", "STUDENT"))
        }
        self.admin = User.objects.create_user("count-admin@example.test", "pw", role="ADMIN")
        User.objects.create_user("count-admin2@example.test", "pw", role="ADMIN")
        for i in range(3):
            User.objects.create_user(f"count-teacher{i}@example.test", "pw", role="TEACHER")
        for i in range(5):
            User.objects.create_user(f"count-student{i}@example.test", "pw", role="STUDENT")
        self.client.force_authenticate(self.admin)

    def test_counts_are_grouped_by_role(self):
        response = self.client.get("/api/dashboard")

        self.assertEqual(
            response.data["accounts"],
            {
                "admins": self.baseline["admins"] + 2,
                "teachers": self.baseline["teachers"] + 3,
                "students": self.baseline["students"] + 5,
            },
        )

    def test_a_disabled_account_still_counts(self):
        User.objects.filter(email="count-student0@example.test").update(is_active=False)

        response = self.client.get("/api/dashboard")

        self.assertEqual(response.data["accounts"]["students"], self.baseline["students"] + 5)

    def test_a_soft_deleted_account_does_not_count(self):
        User.objects.filter(email="count-student0@example.test").update(is_deleted=True)

        response = self.client.get("/api/dashboard")

        self.assertEqual(response.data["accounts"]["students"], self.baseline["students"] + 4)

    def test_a_role_with_no_accounts_reports_zero_not_a_missing_key(self):
        User.objects.filter(role="TEACHER").update(is_deleted=True)

        response = self.client.get("/api/dashboard")

        self.assertEqual(response.data["accounts"]["teachers"], 0)


class AdminClassBucketTests(TestCase):
    """Migration `classes.0001_initial` gieo sẵn hai lớp demo; setUp xoá sạch lớp
    trước khi dựng bảy lớp của mình để bốn con số dưới đây nói về đúng chúng."""

    def setUp(self):
        self.client = APIClient()
        Class.objects.all().delete()
        self.admin = User.objects.create_user("bucket-admin@example.test", "pw", role="ADMIN")
        teacher = User.objects.create_user("bucket-teacher@example.test", "pw", role="TEACHER")
        now = timezone.now()
        make = lambda name, starts, ends, active: Class.objects.create(
            teacher=teacher, name=name, starts_at=starts, ends_at=ends, is_active=active
        )
        make("running-1", now - timedelta(days=1), now + timedelta(days=1), True)
        make("running-2", now - timedelta(days=3), now + timedelta(days=3), True)
        make("scheduled", now + timedelta(days=1), now + timedelta(days=5), True)
        make("ended-1", now - timedelta(days=9), now - timedelta(days=2), True)
        make("ended-2", now - timedelta(days=8), now - timedelta(days=1), True)
        make("ended-3", now - timedelta(days=7), now - timedelta(hours=1), True)
        make("disabled", now - timedelta(days=1), now + timedelta(days=1), False)
        self.client.force_authenticate(self.admin)

    def test_classes_are_split_into_four_buckets(self):
        response = self.client.get("/api/dashboard")

        self.assertEqual(
            response.data["classes"],
            {"running": 2, "scheduled": 1, "ended": 3, "disabled": 1},
        )

    def test_the_buckets_partition_every_class(self):
        response = self.client.get("/api/dashboard")

        self.assertEqual(sum(response.data["classes"].values()), Class.objects.count())

    def test_a_disabled_class_is_never_counted_as_running(self):
        Class.objects.filter(name="running-1").update(is_active=False)

        response = self.client.get("/api/dashboard")

        self.assertEqual(response.data["classes"]["running"], 1)
        self.assertEqual(response.data["classes"]["disabled"], 2)


class AdminRecentAuditTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user("audit-admin@example.test", "pw", role="ADMIN")
        teacher = User.objects.create_user("audit-teacher@example.test", "pw", role="TEACHER")
        teacher.full_name = "Pham Thu Hoa"
        teacher.save()
        self.teacher = teacher
        self.logs = [
            AuditLog.objects.create(
                actor=self.admin, action="account.created",
                target_type="accounts.user", target_id=teacher.id, metadata={},
            )
            for _ in range(7)
        ]
        self.client.force_authenticate(self.admin)

    def test_only_the_five_newest_rows_come_back(self):
        response = self.client.get("/api/dashboard")

        self.assertEqual(len(response.data["recent_audit"]), 5)
        self.assertEqual(
            [row["id"] for row in response.data["recent_audit"]],
            [log.id for log in reversed(self.logs)][:5],
        )

    def test_a_row_carries_the_actor_and_the_resolved_target(self):
        row = self.client.get("/api/dashboard").data["recent_audit"][0]

        self.assertEqual(row["action"], "account.created")
        # `resolve_labels` nêu cả vai trò cho họ action `account.*` (08 §2.1).
        self.assertEqual(row["target_label"], "Teacher Pham Thu Hoa")
        self.assertEqual(row["actor"]["id"], self.admin.id)
        self.assertEqual(row["actor"]["role"], "ADMIN")


class AdminEmptyAuditTests(TestCase):
    """`AuditLog` là append-only — `.delete()` raise `RuntimeError` (08 §4), nên
    danh sách rỗng chỉ dựng được trong một TestCase không ghi log nào."""

    def test_an_empty_log_yields_an_empty_list_not_a_missing_key(self):
        client = APIClient()
        admin = User.objects.create_user("empty-audit@example.test", "pw", role="ADMIN")
        client.force_authenticate(admin)

        response = client.get("/api/dashboard")

        self.assertEqual(response.data["recent_audit"], [])


class TeacherCardTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        now = timezone.now()
        self.teacher = User.objects.create_user("cards-teacher@example.test", "pw", role="TEACHER")
        self.other = User.objects.create_user("cards-other@example.test", "pw", role="TEACHER")
        self.running = Class.objects.create(
            teacher=self.teacher, name="running", starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=5), is_active=True,
        )
        self.ended = Class.objects.create(
            teacher=self.teacher, name="ended", starts_at=now - timedelta(days=9),
            ends_at=now - timedelta(days=1), is_active=True,
        )
        self.foreign = Class.objects.create(
            teacher=self.other, name="foreign", starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=5), is_active=True,
        )
        self.students = [
            User.objects.create_user(f"cards-student{i}@example.test", "pw", role="STUDENT")
            for i in range(3)
        ]
        for student in self.students:
            Enrollment.objects.create(classroom=self.running, student=student)
        # Cùng một người, học thêm lớp thứ hai của chính teacher này.
        Enrollment.objects.create(classroom=self.ended, student=self.students[0])
        Enrollment.objects.create(classroom=self.foreign, student=self.students[0])

        self.open_assignment = Assignment.objects.create(
            classroom=self.running, title="Lab 1", description="d", due_at=now + timedelta(days=2),
        )
        Assignment.objects.create(
            classroom=self.running, title="Lab 0", description="d", due_at=now - timedelta(days=1),
        )
        Assignment.objects.create(
            classroom=self.ended, title="Old lab", description="d", due_at=now + timedelta(days=2),
        )
        self.client.force_authenticate(self.teacher)

    def test_class_cards_count_only_my_classes(self):
        cards = self.client.get("/api/dashboard").data["cards"]

        self.assertEqual(cards["my_classes"], 2)
        self.assertEqual(cards["running_classes"], 1)

    def test_open_assignments_need_both_an_open_class_and_a_future_due_date(self):
        cards = self.client.get("/api/dashboard").data["cards"]

        self.assertEqual(cards["open_assignments"], 1)

    def test_students_are_counted_once_across_my_classes(self):
        cards = self.client.get("/api/dashboard").data["cards"]

        self.assertEqual(cards["students"], 3)

    def test_pending_grading_counts_pairs_not_versions(self):
        for version in (1, 2, 3):
            make_submission(self.open_assignment, self.students[0], version)
        make_submission(self.open_assignment, self.students[1])

        cards = self.client.get("/api/dashboard").data["cards"]

        self.assertEqual(cards["pending_grading"], 2)

    def test_a_graded_pair_stops_being_pending(self):
        make_submission(self.open_assignment, self.students[0])
        make_submission(self.open_assignment, self.students[1])
        AssignmentGrade.objects.create(
            assignment=self.open_assignment, student=self.students[0], score=85,
        )

        cards = self.client.get("/api/dashboard").data["cards"]

        self.assertEqual(cards["pending_grading"], 1)

    def test_a_disabled_class_vanishes_from_every_teacher_number(self):
        """Lớp `is_active=False` vô hình với Teacher hoàn toàn (§6.2), không phải
        chỉ read-only — kể cả bài chờ chấm nằm trong đó."""
        make_submission(self.open_assignment, self.students[0])
        Class.objects.filter(id=self.running.id).update(is_active=False)

        cards = self.client.get("/api/dashboard").data["cards"]

        self.assertEqual(cards["my_classes"], 1)
        self.assertEqual(cards["running_classes"], 0)
        self.assertEqual(cards["open_assignments"], 0)
        self.assertEqual(cards["pending_grading"], 0)

    def test_another_teachers_submissions_are_invisible(self):
        foreign_assignment = Assignment.objects.create(
            classroom=self.foreign, title="Foreign lab", description="d",
            due_at=timezone.now() + timedelta(days=2),
        )
        make_submission(foreign_assignment, self.students[0])

        cards = self.client.get("/api/dashboard").data["cards"]

        self.assertEqual(cards["pending_grading"], 0)
