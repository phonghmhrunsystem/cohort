from datetime import timedelta

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from django.utils.dateparse import parse_datetime
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

    def test_an_actual_grade_stops_being_pending_without_the_legacy_lock_row(self):
        submission = make_submission(self.open_assignment, self.students[0])
        Grade.objects.create(
            assignment=self.open_assignment,
            student=self.students[0],
            teacher=self.teacher,
            submission=submission,
            total_score=85,
            feedback="Good work.",
        )

        data = self.client.get("/api/dashboard").data

        self.assertEqual(data["cards"]["pending_grading"], 0)
        self.assertEqual(data["pending"], [])

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


class TeacherListTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        now = timezone.now()
        self.teacher = User.objects.create_user("list-teacher@example.test", "pw", role="TEACHER")
        self.classroom = Class.objects.create(
            teacher=self.teacher, name="Web Development K18A",
            starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=30), is_active=True,
        )
        self.students = [
            User.objects.create_user(f"list-student{i}@example.test", "pw", role="STUDENT",
                                     full_name=f"Student {i}")
            for i in range(2)
        ]
        for student in self.students:
            Enrollment.objects.create(classroom=self.classroom, student=student)
        self.assignment = Assignment.objects.create(
            classroom=self.classroom, title="Lab 3", description="d", due_at=now + timedelta(days=3),
        )
        self.client.force_authenticate(self.teacher)

    def test_pending_shows_the_latest_version_of_each_pair(self):
        make_submission(self.assignment, self.students[0], version=1)
        latest = make_submission(self.assignment, self.students[0], version=2)

        pending = self.client.get("/api/dashboard").data["pending"]

        self.assertEqual([row["submission_id"] for row in pending], [latest.id])

    def test_a_pending_row_carries_the_names_the_screen_shows(self):
        make_submission(self.assignment, self.students[0])

        row = self.client.get("/api/dashboard").data["pending"][0]

        self.assertEqual(row["assignment_id"], self.assignment.id)
        self.assertEqual(row["assignment_title"], "Lab 3")
        self.assertEqual(row["class_id"], self.classroom.id)
        self.assertEqual(row["class_name"], "Web Development K18A")
        self.assertEqual(row["student"]["id"], self.students[0].id)
        self.assertEqual(row["student"]["full_name"], "Student 0")

    def test_pending_is_newest_first_and_capped_at_ten(self):
        extra = [
            User.objects.create_user(f"list-extra{i}@example.test", "pw", role="STUDENT")
            for i in range(12)
        ]
        for student in extra:
            Enrollment.objects.create(classroom=self.classroom, student=student)
            make_submission(self.assignment, student)

        pending = self.client.get("/api/dashboard").data["pending"]

        self.assertEqual(len(pending), 10)
        self.assertEqual(pending[0]["student"]["id"], extra[-1].id)

    def test_a_graded_pair_leaves_the_pending_list(self):
        make_submission(self.assignment, self.students[0])
        AssignmentGrade.objects.create(assignment=self.assignment, student=self.students[0], score=90)

        self.assertEqual(self.client.get("/api/dashboard").data["pending"], [])

    def test_due_soon_carries_the_two_numbers_that_make_the_row_worth_reading(self):
        make_submission(self.assignment, self.students[0], version=1)
        make_submission(self.assignment, self.students[0], version=2)

        row = self.client.get("/api/dashboard").data["due_soon"][0]

        self.assertEqual(row["assignment_id"], self.assignment.id)
        self.assertEqual(row["submitted_count"], 1)
        self.assertEqual(row["student_count"], 2)

    def test_due_soon_ignores_anything_further_out_than_a_week(self):
        Assignment.objects.create(
            classroom=self.classroom, title="Far away", description="d",
            due_at=timezone.now() + timedelta(days=20),
        )

        due_soon = self.client.get("/api/dashboard").data["due_soon"]

        self.assertEqual([row["assignment_id"] for row in due_soon], [self.assignment.id])


class StudentDashboardTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        now = timezone.now()
        self.teacher = User.objects.create_user("stu-teacher@example.test", "pw", role="TEACHER")
        self.student = User.objects.create_user("stu-student@example.test", "pw", role="STUDENT")
        self.outsider = User.objects.create_user("stu-outsider@example.test", "pw", role="STUDENT")
        self.classroom = Class.objects.create(
            teacher=self.teacher, name="Web Development K18A",
            starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=30), is_active=True,
        )
        self.foreign = Class.objects.create(
            teacher=self.teacher, name="Not mine",
            starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=30), is_active=True,
        )
        Enrollment.objects.create(classroom=self.classroom, student=self.student)
        Enrollment.objects.create(classroom=self.foreign, student=self.outsider)
        self.soon = Assignment.objects.create(
            classroom=self.classroom, title="Lab 4", description="d", due_at=now + timedelta(days=2),
        )
        self.later = Assignment.objects.create(
            classroom=self.classroom, title="Lab 5", description="d", due_at=now + timedelta(days=9),
        )
        self.overdue = Assignment.objects.create(
            classroom=self.classroom, title="Lab 1", description="d", due_at=now - timedelta(days=1),
        )
        Assignment.objects.create(
            classroom=self.foreign, title="Foreign lab", description="d", due_at=now + timedelta(days=2),
        )
        self.client.force_authenticate(self.student)

    def test_only_my_open_unsubmitted_assignments_are_counted(self):
        data = self.client.get("/api/dashboard").data

        self.assertEqual(data["cards"]["my_classes"], 1)
        self.assertEqual(data["cards"]["not_submitted"], 2)

    def test_todo_is_due_date_ascending_and_excludes_overdue_work(self):
        todo = self.client.get("/api/dashboard").data["todo"]

        self.assertEqual([row["assignment_id"] for row in todo], [self.soon.id, self.later.id])
        self.assertEqual(todo[0]["class_name"], "Web Development K18A")

    def test_a_submitted_assignment_leaves_the_todo_list(self):
        make_submission(self.soon, self.student)

        data = self.client.get("/api/dashboard").data

        self.assertEqual(data["cards"]["not_submitted"], 1)
        self.assertEqual([row["assignment_id"] for row in data["todo"]], [self.later.id])

    def test_average_is_null_when_nothing_is_graded_yet(self):
        data = self.client.get("/api/dashboard").data

        self.assertEqual(data["cards"]["graded"], 0)
        self.assertIsNone(data["cards"]["average_score"])

    def test_average_is_rounded_to_one_decimal(self):
        AssignmentGrade.objects.create(assignment=self.soon, student=self.student, score=80)
        AssignmentGrade.objects.create(assignment=self.later, student=self.student, score=85)

        cards = self.client.get("/api/dashboard").data["cards"]

        self.assertEqual(cards["graded"], 2)
        self.assertEqual(cards["average_score"], 82.5)

    def test_recent_grades_are_newest_first(self):
        submission = make_submission(self.overdue, self.student)
        grade = Grade.objects.create(
            assignment=self.overdue, student=self.student, teacher=self.teacher,
            submission=submission, total_score=77, feedback="ok",
        )

        row = self.client.get("/api/dashboard").data["recent_grades"][0]

        self.assertEqual(row["assignment_id"], self.overdue.id)
        self.assertEqual(row["title"], "Lab 1")
        self.assertEqual(row["score"], 77)
        self.assertEqual(row["maximum_score"], 100)
        self.assertEqual(row["class_name"], "Web Development K18A")
        # Serializer đã render datetime thành chuỗi ISO trước khi tới đây.
        self.assertEqual(parse_datetime(row["graded_at"]), grade.created_at)

    def test_a_class_i_am_not_enrolled_in_is_invisible(self):
        todo_titles = [row["title"] for row in self.client.get("/api/dashboard").data["todo"]]

        self.assertNotIn("Foreign lab", todo_titles)

    def test_a_disabled_class_takes_its_assignments_with_it(self):
        Class.objects.filter(id=self.classroom.id).update(is_active=False)

        data = self.client.get("/api/dashboard").data

        self.assertEqual(data["cards"]["my_classes"], 0)
        self.assertEqual(data["cards"]["not_submitted"], 0)
        self.assertEqual(data["todo"], [])


class QueryBudgetTests(TestCase):
    """Ngân sách ≤ 8 query, không phụ thuộc số bản ghi. Nếu test này đỏ vì
    con số tăng: tìm vòng lặp mới, đừng nới ngưỡng.

    Đo thật tại 2026-08-03 với fixture dưới đây: admin=3, teacher=7, student=6.
    Admin rẻ ở đây vì log audit rỗng; khi log chạm cả bốn bảng nhãn thì
    `resolve_labels` thêm bốn query nữa — đo được admin=7, vẫn dưới ngưỡng.
    Teacher là role sát trần nhất: còn đúng một query trống."""

    BUDGET = 8

    def setUp(self):
        self.client = APIClient()
        now = timezone.now()
        self.admin = User.objects.create_user("budget-admin@example.test", "pw", role="ADMIN")
        self.teacher = User.objects.create_user("budget-teacher@example.test", "pw", role="TEACHER")
        self.student = User.objects.create_user("budget-student@example.test", "pw", role="STUDENT")
        self.classroom = Class.objects.create(
            teacher=self.teacher, name="Budget", starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=30), is_active=True,
        )
        Enrollment.objects.create(classroom=self.classroom, student=self.student)
        self.assignment = Assignment.objects.create(
            classroom=self.classroom, title="Lab", description="d", due_at=now + timedelta(days=2),
        )
        make_submission(self.assignment, self.student)

    def _grow(self):
        """Thêm 10 lớp, 10 bài, 10 học viên, 10 bản nộp. Gọi một lần cho mỗi
        role, nên email phải mang cả số vòng — email là unique."""
        now = timezone.now()
        self.round = getattr(self, "round", 0) + 1
        for i in range(10):
            classroom = Class.objects.create(
                teacher=self.teacher, name=f"Grow {self.round}-{i}", starts_at=now - timedelta(days=1),
                ends_at=now + timedelta(days=30), is_active=True,
            )
            student = User.objects.create_user(f"grow{self.round}-{i}@example.test", "pw", role="STUDENT")
            Enrollment.objects.create(classroom=classroom, student=student)
            Enrollment.objects.create(classroom=classroom, student=self.student)
            assignment = Assignment.objects.create(
                classroom=classroom, title=f"Lab {i}", description="d", due_at=now + timedelta(days=2),
            )
            make_submission(assignment, student)

    def test_each_role_stays_within_budget_and_does_not_grow_with_data(self):
        for user in (self.admin, self.teacher, self.student):
            self.client.force_authenticate(user)
            with CaptureQueriesContext(connection) as small:
                self.client.get("/api/dashboard")
            self._grow()
            with CaptureQueriesContext(connection) as large:
                self.client.get("/api/dashboard")

            self.assertLessEqual(len(small.captured_queries), self.BUDGET, msg=f"{user.role} over budget")
            self.assertEqual(
                len(small.captured_queries), len(large.captured_queries),
                msg=f"{user.role}: query count grew with the data",
            )
