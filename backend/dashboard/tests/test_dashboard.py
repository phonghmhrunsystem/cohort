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
