from django.test import TestCase
from django.db import IntegrityError
from rest_framework.test import APIClient
from unittest.mock import patch

from accounts.models import User
from audit.models import AuditLog
from cohorts.models import Cohort, Enrollment


class CohortApiTests(TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user("teacher@example.test", "pw", role="TEACHER")
        self.other_teacher = User.objects.create_user(
            "other-teacher@example.test", "pw", role="TEACHER"
        )
        self.student = User.objects.create_user("student@example.test", "pw", role="STUDENT")
        self.other_student = User.objects.create_user(
            "other-student@example.test", "pw", role="STUDENT"
        )
        self.cohort = Cohort.objects.create(
            teacher=self.teacher, name="Python basics", description="Introductory course"
        )
        Enrollment.objects.create(cohort=self.cohort, student=self.student)
        self.teacher_client = APIClient()
        self.teacher_client.force_authenticate(self.teacher)
        self.other_teacher_client = APIClient()
        self.other_teacher_client.force_authenticate(self.other_teacher)
        self.student_client = APIClient()
        self.student_client.force_authenticate(self.student)
        self.other_student_client = APIClient()
        self.other_student_client.force_authenticate(self.other_student)

    def test_only_enrolled_student_can_read_cohort(self):
        response = self.other_student_client.get(f"/api/cohorts/{self.cohort.id}")

        self.assertEqual(response.status_code, 404)

    def test_student_list_contains_only_enrolled_cohorts(self):
        response = self.student_client.get("/api/cohorts")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([cohort["id"] for cohort in response.data], [self.cohort.id])

    def test_teacher_cannot_edit_another_teachers_cohort(self):
        response = self.other_teacher_client.patch(
            f"/api/cohorts/{self.cohort.id}", {"name": "Changed"}
        )

        self.assertEqual(response.status_code, 404)
        self.cohort.refresh_from_db()
        self.assertEqual(self.cohort.name, "Python basics")

    def test_enrollment_rejects_teacher_account(self):
        response = self.teacher_client.post(
            f"/api/cohorts/{self.cohort.id}/enrollments", {"student_id": self.other_teacher.id}
        )

        self.assertEqual(response.status_code, 422)

    def test_enrollment_rejects_inactive_student_account(self):
        self.other_student.is_active = False
        self.other_student.save(update_fields=("is_active",))

        response = self.teacher_client.post(
            f"/api/cohorts/{self.cohort.id}/enrollments", {"student_id": self.other_student.id}
        )

        self.assertEqual(response.status_code, 422)
        self.assertFalse(Enrollment.objects.filter(cohort=self.cohort, student=self.other_student).exists())

    def test_duplicate_enrollment_is_rejected(self):
        response = self.teacher_client.post(
            f"/api/cohorts/{self.cohort.id}/enrollments", {"student_id": self.student.id}
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(Enrollment.objects.filter(cohort=self.cohort, student=self.student).count(), 1)

    @patch("cohorts.views.EnrollmentSerializer.save", side_effect=IntegrityError)
    def test_concurrent_enrollment_constraint_conflict_returns_422(self, _save):
        response = self.teacher_client.post(
            f"/api/cohorts/{self.cohort.id}/enrollments", {"student_id": self.other_student.id}
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(AuditLog.objects.count(), 0)

    def test_create_cohort_and_enrollment_write_audit_rows(self):
        response = self.teacher_client.post(
            "/api/cohorts", {"name": "Django", "description": "Web development"}
        )

        self.assertEqual(response.status_code, 201)
        cohort_id = response.data["id"]
        self.assertEqual(response.data["teacher_id"], self.teacher.id)
        self.assertEqual(
            AuditLog.objects.get(target_type="cohorts.cohort", target_id=cohort_id).action,
            "cohort.created",
        )

        response = self.teacher_client.post(
            f"/api/cohorts/{cohort_id}/enrollments", {"student_id": self.other_student.id}
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["student_id"], self.other_student.id)
        self.assertEqual(
            AuditLog.objects.get(
                target_type="cohorts.enrollment", target_id=response.data["id"]
            ).action,
            "enrollment.created",
        )
