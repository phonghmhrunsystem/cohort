from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from assignments.models import Assignment
from audit.models import AuditLog
from classes.models import Class, Enrollment
from grading.models import Grade
from submissions.models import Submission


class AssignmentApiTests(TestCase):
    def setUp(self):
        now = timezone.now()
        self.teacher = User.objects.create_user("teacher@example.test", "pw", role="TEACHER")
        self.other_teacher = User.objects.create_user("other@example.test", "pw", role="TEACHER")
        self.admin = User.objects.create_user("admin@example.test", "pw", role="ADMIN")
        self.student = User.objects.create_user("student@example.test", "pw", role="STUDENT")
        self.unenrolled_student = User.objects.create_user(
            "unenrolled@example.test", "pw", role="STUDENT"
        )
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
        Enrollment.objects.create(classroom=self.classroom, student=self.student)
        self.teacher_client = APIClient()
        self.teacher_client.force_authenticate(self.teacher)
        self.other_teacher_client = APIClient()
        self.other_teacher_client.force_authenticate(self.other_teacher)
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(self.admin)
        self.student_client = APIClient()
        self.student_client.force_authenticate(self.student)
        self.unenrolled_student_client = APIClient()
        self.unenrolled_student_client.force_authenticate(self.unenrolled_student)

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

    def test_enrolled_student_lists_assignments_but_cannot_mutate_them(self):
        created = self.teacher_client.post(
            f"/api/classes/{self.classroom.id}/assignments",
            self.payload(),
            format="json",
        ).data

        self.assertEqual(self.assignment_operation_statuses(self.admin_client, created["id"]), [403] * 5)
        self.assertEqual(self.assignment_operation_statuses(self.student_client, created["id"]), [200, 403, 200, 403, 403])
        self.assertEqual(self.student_client.get(f"/api/classes/{self.classroom.id}/assignments").data[0]["id"], created["id"])

    def test_enrolled_student_can_read_assignment_detail_with_criteria(self):
        assignment = self.teacher_client.post(f"/api/classes/{self.classroom.id}/assignments", self.payload(), format="json").data
        self.teacher_client.put(
            f"/api/assignments/{assignment['id']}/rubric",
            {"criteria": [{"title": "Code", "maximum_score": 60}, {"title": "Tests", "maximum_score": 40}]},
            format="json",
        )
        response = self.student_client.get(f"/api/assignments/{assignment['id']}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([c["title"] for c in response.data["criteria"]], ["Code", "Tests"])

        response = self.unenrolled_student_client.get(f"/api/assignments/{assignment['id']}")
        self.assertEqual(response.status_code, 404)

    def test_unrelated_teacher_and_unenrolled_student_get_404_for_assignments(self):
        created = self.teacher_client.post(f"/api/classes/{self.classroom.id}/assignments", self.payload(), format="json").data

        for client in (
            self.other_teacher_client,
            self.unenrolled_student_client,
        ):
            self.assertEqual(
                self.assignment_operation_statuses(client, created["id"]),
                [404] * 5,
            )

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

    def test_assignment_update_rejects_a_past_deadline(self):
        assignment = self.teacher_client.post(f"/api/classes/{self.classroom.id}/assignments", self.payload(), format="json").data
        response = self.teacher_client.patch(
            f"/api/assignments/{assignment['id']}",
            {"due_at": (timezone.now() - timedelta(minutes=1)).isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 422)

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

    def test_rubric_rejects_an_empty_criteria_list(self):
        assignment = self.teacher_client.post(f"/api/classes/{self.classroom.id}/assignments", self.payload(), format="json").data
        response = self.teacher_client.put(f"/api/assignments/{assignment['id']}/rubric", {"criteria": []}, format="json")
        self.assertEqual(response.status_code, 422)
        self.assertIn("at least one", str(response.data["criteria"]).lower())

    def test_rubric_cannot_be_replaced_once_a_submission_is_graded(self):
        from submissions.models import Submission

        assignment = self.teacher_client.post(f"/api/classes/{self.classroom.id}/assignments", self.payload(), format="json").data
        rubric = {"criteria": [{"title": "Code", "maximum_score": 60}, {"title": "Tests", "maximum_score": 40}]}
        self.teacher_client.put(f"/api/assignments/{assignment['id']}/rubric", rubric, format="json")
        criteria_before = list(
            self.teacher_client.get(f"/api/assignments/{assignment['id']}").data["criteria"]
        )

        submission = Submission.objects.create(
            assignment_id=assignment["id"],
            student=self.student,
            version=1,
            file_path=f"submissions/{assignment['id']}-{self.student.id}-1.pdf",
            original_filename="submission.pdf",
            content_type="application/pdf",
            size=10,
        )
        criterion_ids = [c["id"] for c in criteria_before]
        graded = self.teacher_client.put(
            f"/api/submissions/{submission.id}/grade",
            {
                "feedback": "Good work",
                "scores": [
                    {"criterion_id": criterion_ids[0], "score": 60},
                    {"criterion_id": criterion_ids[1], "score": 40},
                ],
            },
            format="json",
        )
        self.assertEqual(graded.status_code, 200)

        response = self.teacher_client.put(f"/api/assignments/{assignment['id']}/rubric", rubric, format="json")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["detail"], "This Assignment has already been graded.")

        criteria_after = self.teacher_client.get(f"/api/assignments/{assignment['id']}").data["criteria"]
        self.assertEqual(criteria_after, criteria_before)

    def test_student_assignment_list_returns_the_authoritative_learning_states(self):
        from assignments.services import assignment_learning_state, deadline_badge

        now = timezone.now()
        open_assignment = Assignment.objects.create(
            classroom=self.classroom,
            title="Open assignment",
            description="Build and document a small application.",
            due_at=now + timedelta(days=1),
        )
        submitted_assignment = Assignment.objects.create(
            classroom=self.classroom,
            title="Submitted assignment",
            description="Build and document a small application.",
            due_at=now + timedelta(days=1),
        )
        graded_assignment = Assignment.objects.create(
            classroom=self.classroom,
            title="Graded assignment",
            description="Build and document a small application.",
            due_at=now - timedelta(days=1),
        )
        closed_assignment = Assignment.objects.create(
            classroom=self.classroom,
            title="Closed assignment",
            description="Build and document a small application.",
            due_at=now - timedelta(seconds=1),
        )
        submission = Submission.objects.create(
            assignment=submitted_assignment,
            student=self.student,
            version=1,
            file_path="submissions/submitted.pdf",
            original_filename="submitted.pdf",
            content_type="application/pdf",
            size=10,
        )
        graded_submission = Submission.objects.create(
            assignment=graded_assignment,
            student=self.student,
            version=1,
            file_path="submissions/graded.pdf",
            original_filename="graded.pdf",
            content_type="application/pdf",
            size=10,
        )
        Grade.objects.create(
            assignment=graded_assignment,
            student=self.student,
            teacher=self.teacher,
            submission=graded_submission,
            total_score=90,
            feedback="Good work.",
        )

        self.assertEqual(assignment_learning_state(open_assignment, self.student, now), "OPEN")
        self.assertEqual(assignment_learning_state(submitted_assignment, self.student, now), "SUBMITTED")
        self.assertEqual(assignment_learning_state(graded_assignment, self.student, now), "GRADED")
        self.assertEqual(assignment_learning_state(closed_assignment, self.student, now), "CLOSED")
        self.assertEqual(deadline_badge(now + timedelta(hours=1), now), "Còn hôm nay")
        self.assertEqual(deadline_badge(now + timedelta(days=1), now), "Còn 1 ngày")
        self.assertEqual(deadline_badge(now + timedelta(days=3), now), "Còn 3 ngày")
        self.assertEqual(deadline_badge(now - timedelta(seconds=1), now), "Đã hết hạn")

        response = self.student_client.get(f"/api/classes/{self.classroom.id}/assignments")
        self.assertEqual(response.status_code, 200)
        by_id = {assignment["id"]: assignment for assignment in response.data}
        self.assertEqual(by_id[open_assignment.id]["learning_state"], "OPEN")
        self.assertEqual(by_id[submitted_assignment.id]["learning_state"], "SUBMITTED")
        self.assertEqual(by_id[graded_assignment.id]["learning_state"], "GRADED")
        self.assertEqual(by_id[closed_assignment.id]["learning_state"], "CLOSED")
        self.assertEqual(by_id[closed_assignment.id]["closure_reason"], "Deadline has passed.")
        self.assertEqual(by_id[open_assignment.id]["deadline_badge"], "Còn 1 ngày")

        self.classroom.ends_at = now - timedelta(seconds=1)
        self.classroom.save(update_fields=("ends_at",))
        self.assertEqual(
            assignment_learning_state(open_assignment, self.student, now), "CLOSED"
        )

    def payload(self, **overrides):
        return {
            "title": "Final project",
            "description": "Build and document a small application.",
            "due_at": (timezone.now() + timedelta(days=1)).isoformat(),
            **overrides,
        }

    def test_assignment_default_ordering_is_newest_first(self):
        older = Assignment.objects.create(
            classroom=self.classroom, title="Older",
            description="Build and document a small application.",
            due_at=timezone.now() + timedelta(days=1),
        )
        newer = Assignment.objects.create(
            classroom=self.classroom, title="Newer",
            description="Build and document a small application.",
            due_at=timezone.now() + timedelta(days=2),
        )
        self.assertEqual(
            list(Assignment.objects.values_list("id", flat=True)),
            [newer.id, older.id],
        )

    def test_teacher_assignment_list_orders_by_created_at_desc_and_includes_counts(self):
        first = self.teacher_client.post(
            f"/api/classes/{self.classroom.id}/assignments", self.payload(title="First"), format="json"
        ).data
        second = self.teacher_client.post(
            f"/api/classes/{self.classroom.id}/assignments", self.payload(title="Second"), format="json"
        ).data

        other_student = User.objects.create_user("other-student@example.test", "pw", role="STUDENT")
        Enrollment.objects.create(classroom=self.classroom, student=other_student)

        Submission.objects.create(
            assignment_id=first["id"], student=self.student, version=1,
            file_path="submissions/a.pdf", original_filename="a.pdf",
            content_type="application/pdf", size=10,
        )
        submission_two = Submission.objects.create(
            assignment_id=first["id"], student=other_student, version=1,
            file_path="submissions/b.pdf", original_filename="b.pdf",
            content_type="application/pdf", size=10,
        )
        Grade.objects.create(
            assignment_id=first["id"], student=other_student, teacher=self.teacher,
            submission=submission_two, total_score=90, feedback="Nice.",
        )

        response = self.teacher_client.get(f"/api/classes/{self.classroom.id}/assignments")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.data], [second["id"], first["id"]])

        first_row = next(row for row in response.data if row["id"] == first["id"])
        second_row = next(row for row in response.data if row["id"] == second["id"])
        self.assertEqual(first_row["submitted_count"], 2)
        self.assertEqual(first_row["graded_count"], 1)
        self.assertEqual(first_row["enrolled_count"], 2)
        self.assertEqual(second_row["submitted_count"], 0)
        self.assertEqual(second_row["graded_count"], 0)
        self.assertEqual(second_row["enrolled_count"], 2)
        self.assertIsNotNone(first_row["created_at"])

        student_response = self.student_client.get(f"/api/classes/{self.classroom.id}/assignments")
        self.assertIsNone(student_response.data[0]["submitted_count"])
        self.assertIsNone(student_response.data[0]["graded_count"])
        self.assertIsNone(student_response.data[0]["enrolled_count"])

    def test_teacher_assignment_list_excludes_soft_deleted_students_from_enrolled_count(self):
        assignment = self.teacher_client.post(
            f"/api/classes/{self.classroom.id}/assignments", self.payload(), format="json"
        ).data

        # Create a soft-deleted student and enroll them
        deleted_student = User.objects.create_user("deleted@example.test", "pw", role="STUDENT", is_deleted=True)
        Enrollment.objects.create(classroom=self.classroom, student=deleted_student)

        # Verify enrolled_count excludes the soft-deleted student
        response = self.teacher_client.get(f"/api/classes/{self.classroom.id}/assignments")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["enrolled_count"], 1)  # Only self.student, not deleted_student

    def assignment_operation_statuses(self, client, assignment_id):
        return [
            client.get(
                f"/api/classes/{self.classroom.id}/assignments"
            ).status_code,
            client.post(
                f"/api/classes/{self.classroom.id}/assignments",
                self.payload(),
                format="json",
            ).status_code,
            client.get(f"/api/assignments/{assignment_id}").status_code,
            client.patch(
                f"/api/assignments/{assignment_id}",
                {"title": "Nope"},
                format="json",
            ).status_code,
            client.put(
                f"/api/assignments/{assignment_id}/rubric",
                {"criteria": [{"title": "Nope", "maximum_score": 100}]},
                format="json",
            ).status_code,
        ]
