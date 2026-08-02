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
