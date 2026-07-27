from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditLog
from classes.models import Class


class AssignmentApiTests(TestCase):
    def setUp(self):
        now = timezone.now()
        self.teacher = User.objects.create_user("teacher@example.test", "pw", role="TEACHER")
        self.other_teacher = User.objects.create_user("other@example.test", "pw", role="TEACHER")
        self.classroom = Class.objects.create(
            teacher=self.teacher,
            name="Python Basics",
            starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=2),
        )
        self.other_classroom = Class.objects.create(
            teacher=self.other_teacher,
            name="Java Basics",
            starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=2),
        )
        self.teacher_client = APIClient()
        self.teacher_client.force_authenticate(self.teacher)
        self.other_teacher_client = APIClient()
        self.other_teacher_client.force_authenticate(self.other_teacher)

    def test_assigned_teacher_creates_and_updates_assignment_with_audit(self):
        response = self.teacher_client.post(f"/api/classes/{self.classroom.id}/assignments", self.payload(), format="json")
        self.assertEqual(response.status_code, 201)
        assignment_id = response.data["id"]
        self.assertEqual(response.data["maximum_score"], 100)
        self.assertEqual(AuditLog.objects.get(target_id=assignment_id).action, "assignment.created")

        response = self.teacher_client.patch(f"/api/assignments/{assignment_id}", {"title": "Updated title"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "Updated title")
        self.assertEqual(AuditLog.objects.get(target_id=assignment_id, action="assignment.updated").action, "assignment.updated")

    def test_other_teacher_cannot_read_or_mutate_assignments(self):
        created = self.teacher_client.post(f"/api/classes/{self.classroom.id}/assignments", self.payload(), format="json").data
        self.assertEqual(self.other_teacher_client.get(f"/api/classes/{self.classroom.id}/assignments").status_code, 404)
        self.assertEqual(self.other_teacher_client.patch(f"/api/assignments/{created['id']}", {"title": "Nope"}, format="json").status_code, 404)
        self.assertEqual(self.other_teacher_client.post(f"/api/classes/{self.classroom.id}/assignments", self.payload(), format="json").status_code, 404)

    def test_only_open_class_accepts_coursework_mutations(self):
        self.classroom.starts_at = timezone.now() + timedelta(hours=1)
        self.classroom.save(update_fields=("starts_at",))
        self.assertEqual(self.teacher_client.post(f"/api/classes/{self.classroom.id}/assignments", self.payload(), format="json").status_code, 422)

        self.classroom.starts_at = timezone.now() - timedelta(days=2)
        self.classroom.ends_at = timezone.now() - timedelta(seconds=1)
        self.classroom.save(update_fields=("starts_at", "ends_at"))
        self.assertEqual(self.teacher_client.post(f"/api/classes/{self.classroom.id}/assignments", self.payload(), format="json").status_code, 422)

    def test_assignment_rejects_invalid_limits_and_due_date_outside_open_class_period(self):
        for payload in (
            self.payload(title=" x "),
            self.payload(description=" short "),
            self.payload(due_at=(timezone.now() - timedelta(minutes=1)).isoformat()),
            self.payload(due_at=(self.classroom.ends_at + timedelta(minutes=1)).isoformat()),
            {**self.payload(), "maximum_score": 99},
        ):
            self.assertEqual(self.teacher_client.post(f"/api/classes/{self.classroom.id}/assignments", payload, format="json").status_code, 422)

    def test_rubric_replacement_is_atomic_and_must_total_100(self):
        assignment = self.teacher_client.post(f"/api/classes/{self.classroom.id}/assignments", self.payload(), format="json").data
        valid = {"criteria": [{"title": "Code", "maximum_score": 60}, {"title": "Tests", "maximum_score": 40}]}
        response = self.teacher_client.put(f"/api/assignments/{assignment['id']}/rubric", valid, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([criterion["maximum_score"] for criterion in response.data["criteria"]], [60, 40])
        self.assertEqual(AuditLog.objects.get(target_id=assignment["id"], action="assignment.rubric.updated").action, "assignment.rubric.updated")

        response = self.teacher_client.put(f"/api/assignments/{assignment['id']}/rubric", {"criteria": [{"title": "Broken", "maximum_score": 80}]}, format="json")
        self.assertEqual(response.status_code, 422)
        self.assertEqual([criterion["maximum_score"] for criterion in self.teacher_client.get(f"/api/assignments/{assignment['id']}").data["criteria"]], [60, 40])

    def payload(self, **overrides):
        return {
            "title": "Final project",
            "description": "Build and document a small application.",
            "due_at": (timezone.now() + timedelta(days=1)).isoformat(),
            **overrides,
        }
