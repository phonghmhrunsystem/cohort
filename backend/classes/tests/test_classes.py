from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from assignments.models import Assignment
from audit.models import AuditLog
from classes.models import Class, Enrollment


class ClassApiTests(TestCase):
    def setUp(self):
        now = timezone.now()
        self.admin = User.objects.create_user("admin@example.test", "pw", role="ADMIN")
        self.teacher = User.objects.create_user("teacher@example.test", "pw", role="TEACHER")
        self.other_teacher = User.objects.create_user("other-teacher@example.test", "pw", role="TEACHER")
        self.student = User.objects.create_user("student@example.test", "pw", role="STUDENT")
        self.other_student = User.objects.create_user("other-student@example.test", "pw", role="STUDENT")
        self.course = Class.objects.create(
            teacher=self.teacher,
            name="Redorange Basics",
            description="Introductory course",
            starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=1),
        )
        self.other_course = Class.objects.create(
            teacher=self.other_teacher,
            name="Blueviolet Basics",
            starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=1),
        )
        Enrollment.objects.create(classroom=self.course, student=self.student)
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(self.admin)
        self.teacher_client = APIClient()
        self.teacher_client.force_authenticate(self.teacher)
        self.other_teacher_client = APIClient()
        self.other_teacher_client.force_authenticate(self.other_teacher)
        self.student_client = APIClient()
        self.student_client.force_authenticate(self.student)
        self.other_student_client = APIClient()
        self.other_student_client.force_authenticate(self.other_student)

    def test_only_admin_can_mutate_classes_and_enrollment(self):
        payload = self.class_payload()
        self.assertEqual(self.teacher_client.post("/api/classes", payload, format="json").status_code, 403)
        self.assertEqual(self.teacher_client.patch(f"/api/classes/{self.course.id}", {"name": "Changed"}, format="json").status_code, 403)
        self.assertEqual(self.teacher_client.post(f"/api/classes/{self.course.id}/enrollments", {"student_id": self.other_student.id}, format="json").status_code, 403)
        self.assertEqual(self.teacher_client.delete(f"/api/classes/{self.course.id}/enrollments/{self.student.id}").status_code, 403)
        self.assertEqual(self.teacher_client.put(f"/api/classes/{self.course.id}/enrollments", {"student_ids": []}, format="json").status_code, 403)

    def test_successful_class_and_enrollment_mutations_are_audited(self):
        response = self.admin_client.post("/api/classes", self.class_payload(), format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(AuditLog.objects.get(target_type="classes.class", target_id=response.data["id"]).action, "class.created")

        response = self.admin_client.post(f"/api/classes/{self.course.id}/enrollments", {"student_id": self.other_student.id}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(AuditLog.objects.get(target_type="classes.enrollment", target_id=response.data["id"]).action, "enrollment.created")

    def test_create_requires_an_active_teacher_and_teacher_cannot_change(self):
        self.teacher.is_active = False
        self.teacher.save(update_fields=("is_active",))
        response = self.admin_client.post("/api/classes", self.class_payload(teacher_id=self.teacher.id), format="json")
        self.assertEqual(response.status_code, 422)

        response = self.admin_client.patch(f"/api/classes/{self.course.id}", {"teacher_id": self.other_teacher.id}, format="json")
        self.assertEqual(response.status_code, 422)
        self.course.refresh_from_db()
        self.assertEqual(self.course.teacher_id, self.teacher.id)

    def test_create_requires_start_before_end(self):
        now = timezone.now()
        response = self.admin_client.post(
            "/api/classes",
            self.class_payload(starts_at=now.isoformat(), ends_at=now.isoformat()),
            format="json",
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("ends_at", response.data)

    def test_patch_rejects_end_before_an_existing_assignment_deadline(self):
        due_at = timezone.now() + timedelta(hours=12)
        Assignment.objects.create(
            classroom=self.course,
            title="Project",
            description="Build a documented project.",
            due_at=due_at,
        )
        original_ends_at = self.course.ends_at

        response = self.admin_client.patch(
            f"/api/classes/{self.course.id}",
            {"ends_at": (due_at - timedelta(minutes=1)).isoformat()},
            format="json",
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("ends_at", response.data)
        self.course.refresh_from_db()
        self.assertEqual(self.course.ends_at, original_ends_at)

    def test_list_search_is_scoped_by_role(self):
        response = self.admin_client.get("/api/classes", {"q": "redorange"})
        self.assertEqual([item["id"] for item in response.data], [self.course.id])
        response = self.teacher_client.get("/api/classes", {"q": "redorange"})
        self.assertEqual([item["id"] for item in response.data], [self.course.id])
        response = self.student_client.get("/api/classes", {"q": "redorange"})
        self.assertEqual([item["id"] for item in response.data], [self.course.id])
        self.assertEqual(self.other_student_client.get("/api/classes").data, [])

    def test_detail_and_students_reads_are_role_scoped(self):
        self.assertEqual(self.admin_client.get(f"/api/classes/{self.other_course.id}").status_code, 200)
        self.assertEqual(self.teacher_client.get(f"/api/classes/{self.course.id}").status_code, 200)
        self.assertEqual(self.teacher_client.get(f"/api/classes/{self.other_course.id}").status_code, 404)
        self.assertEqual(self.student_client.get(f"/api/classes/{self.course.id}").status_code, 200)
        self.assertEqual(self.student_client.get(f"/api/classes/{self.other_course.id}").status_code, 404)
        response = self.admin_client.get(f"/api/classes/{self.course.id}/students")
        self.assertEqual(response.status_code, 200)
        candidate_ids = [item["id"] for item in response.data]
        self.assertIn(self.student.id, candidate_ids)
        self.assertIn(self.other_student.id, candidate_ids)
        self.assertEqual(self.teacher_client.get(f"/api/classes/{self.course.id}/students").status_code, 403)
        self.assertEqual(self.student_client.get(f"/api/classes/{self.course.id}/students").status_code, 403)

    def test_ended_class_is_read_only_for_admin(self):
        self.course.ends_at = timezone.now() - timedelta(seconds=1)
        self.course.save(update_fields=("ends_at",))
        self.assertEqual(self.admin_client.patch(f"/api/classes/{self.course.id}", {"name": "Changed"}, format="json").status_code, 422)
        self.assertEqual(self.admin_client.post(f"/api/classes/{self.course.id}/enrollments", {"student_id": self.other_student.id}, format="json").status_code, 422)

    def test_enrollment_rejects_duplicate_and_inactive_student(self):
        self.assertEqual(self.admin_client.post(f"/api/classes/{self.course.id}/enrollments", {"student_id": self.student.id}, format="json").status_code, 422)
        self.other_student.is_active = False
        self.other_student.save(update_fields=("is_active",))
        self.assertEqual(self.admin_client.post(f"/api/classes/{self.course.id}/enrollments", {"student_id": self.other_student.id}, format="json").status_code, 422)

    def test_removal_is_blocked_after_end_or_a_submission(self):
        self.course.ends_at = timezone.now() - timedelta(seconds=1)
        self.course.save(update_fields=("ends_at",))
        self.assertEqual(self.admin_client.delete(f"/api/classes/{self.course.id}/enrollments/{self.student.id}").status_code, 422)

        self.course.ends_at = timezone.now() + timedelta(days=1)
        self.course.save(update_fields=("ends_at",))
        with patch("classes.views.student_has_submission", return_value=True):
            self.assertEqual(self.admin_client.delete(f"/api/classes/{self.course.id}/enrollments/{self.student.id}").status_code, 422)

    def test_admin_can_replace_the_enrollment_roster(self):
        response = self.admin_client.put(
            f"/api/classes/{self.course.id}/enrollments",
            {"student_ids": [self.other_student.id]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [{"id": self.other_student.id, "full_name": None, "email": "other-student@example.test"}])
        self.assertEqual(list(self.course.enrollments.values_list("student_id", flat=True)), [self.other_student.id])
        audit = AuditLog.objects.get(action="enrollment.replaced")
        self.assertEqual((audit.target_type, audit.target_id), ("classes.class", self.course.id))

    def test_replacement_rejects_duplicate_inactive_or_non_student_without_changes(self):
        url = f"/api/classes/{self.course.id}/enrollments"
        before = list(self.course.enrollments.values_list("student_id", flat=True))

        for student_ids in ([self.student.id, self.student.id], [self.student.id, self.teacher.id]):
            response = self.admin_client.put(url, {"student_ids": student_ids}, format="json")
            self.assertEqual(response.status_code, 422)
            self.assertEqual(list(self.course.enrollments.values_list("student_id", flat=True)), before)

        self.other_student.is_active = False
        self.other_student.save(update_fields=("is_active",))
        response = self.admin_client.put(url, {"student_ids": [self.other_student.id]}, format="json")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(list(self.course.enrollments.values_list("student_id", flat=True)), before)

    def test_replacement_cannot_remove_after_class_end_or_submission(self):
        url = f"/api/classes/{self.course.id}/enrollments"
        before = list(self.course.enrollments.values_list("student_id", flat=True))
        self.course.ends_at = timezone.now() - timedelta(seconds=1)
        self.course.save(update_fields=("ends_at",))

        self.assertEqual(self.admin_client.put(url, {"student_ids": []}, format="json").status_code, 422)
        self.assertEqual(list(self.course.enrollments.values_list("student_id", flat=True)), before)

        self.course.ends_at = timezone.now() + timedelta(days=1)
        self.course.save(update_fields=("ends_at",))
        with patch("classes.views.student_has_submission", return_value=True):
            self.assertEqual(self.admin_client.put(url, {"student_ids": []}, format="json").status_code, 422)
        self.assertEqual(list(self.course.enrollments.values_list("student_id", flat=True)), before)

    def class_payload(self, **overrides):
        now = timezone.now()
        return {
            "name": "Data Structures",
            "description": "Algorithms and data structures",
            "teacher_id": self.teacher.id,
            "starts_at": (now + timedelta(days=1)).isoformat(),
            "ends_at": (now + timedelta(days=2)).isoformat(),
            **overrides,
        }
