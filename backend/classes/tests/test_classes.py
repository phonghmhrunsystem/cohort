from datetime import timedelta
from unittest.mock import patch

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from assignments.models import Assignment
from audit.models import AuditLog
from classes.models import Class, Enrollment
from grading.models import Grade
from submissions.models import Submission


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

    def test_enrolled_student_sees_safe_teacher_details_but_not_another_class(self):
        self.teacher.full_name = "Teacher Example"
        self.teacher.save(update_fields=("full_name",))

        response = self.student_client.get(f"/api/classes/{self.course.id}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["teacher"],
            {"id": self.teacher.id, "full_name": "Teacher Example", "email": "teacher@example.test"},
        )
        self.assertEqual(self.student_client.get(f"/api/classes/{self.other_course.id}").status_code, 404)

    def test_enrolled_student_class_includes_server_computed_progress_and_nearest_deadline(self):
        now = timezone.now()
        graded_assignment = Assignment.objects.create(
            classroom=self.course,
            title="Graded work",
            description="Build a documented project.",
            due_at=now + timedelta(hours=2),
        )
        open_assignment = Assignment.objects.create(
            classroom=self.course,
            title="Open work",
            description="Build a documented project.",
            due_at=now + timedelta(hours=4),
        )
        submission = Submission.objects.create(
            assignment=graded_assignment,
            student=self.student,
            version=1,
            file_path="submissions/graded.pdf",
            original_filename="graded.pdf",
            content_type="application/pdf",
            size=10,
            note="",
        )
        Grade.objects.create(
            assignment=graded_assignment,
            student=self.student,
            teacher=self.teacher,
            submission=submission,
            total_score=90,
            feedback="Good work.",
        )

        response = self.student_client.get(f"/api/classes/{self.course.id}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["progress"],
            {
                "graded_assignments": 1,
                "total_assignments": 2,
                "nearest_deadline": open_assignment.due_at.isoformat(),
            },
        )

    def test_detail_and_students_reads_are_role_scoped(self):
        self.assertEqual(self.admin_client.get(f"/api/classes/{self.other_course.id}").status_code, 200)
        self.assertEqual(self.teacher_client.get(f"/api/classes/{self.course.id}").status_code, 200)
        self.assertEqual(self.teacher_client.get(f"/api/classes/{self.other_course.id}").status_code, 404)
        self.assertEqual(self.student_client.get(f"/api/classes/{self.course.id}").status_code, 200)
        self.assertEqual(self.student_client.get(f"/api/classes/{self.other_course.id}").status_code, 404)
        response = self.admin_client.get(f"/api/classes/{self.course.id}/students?candidates=1")
        self.assertEqual(response.status_code, 200)
        candidate_ids = [item["id"] for item in response.data]
        self.assertIn(self.student.id, candidate_ids)
        self.assertIn(self.other_student.id, candidate_ids)
        self.assertEqual(self.teacher_client.get(f"/api/classes/{self.course.id}/students?candidates=1").status_code, 403)
        self.assertEqual(self.student_client.get(f"/api/classes/{self.course.id}/students?candidates=1").status_code, 403)

    def test_enrollment_read_returns_current_roster_to_admin_and_assigned_teacher(self):
        expected = [{"id": self.student.id, "full_name": None, "email": "student@example.test"}]

        for client in (self.admin_client, self.teacher_client):
            response = client.get(f"/api/classes/{self.course.id}/enrollments")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data, expected)
        self.assertEqual(self.other_teacher_client.get(f"/api/classes/{self.course.id}/enrollments").status_code, 404)
        self.assertEqual(self.student_client.get(f"/api/classes/{self.course.id}/enrollments").status_code, 403)

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

    def test_empty_roster_replacement_locks_the_class_before_reading_enrollments(self):
        self.course.enrollments.all().delete()

        with CaptureQueriesContext(connection) as queries:
            response = self.admin_client.put(
                f"/api/classes/{self.course.id}/enrollments",
                {"student_ids": []},
                format="json",
            )

        statements = [query["sql"].upper() for query in queries]
        class_locks = [
            index
            for index, sql in enumerate(statements)
            if "CLASSES_CLASS" in sql
            and (
                "FOR UPDATE" in sql
                if connection.features.has_select_for_update
                else sql.lstrip().startswith("UPDATE")
            )
        ]
        enrollment_reads = [
            index
            for index, sql in enumerate(statements)
            if sql.lstrip().startswith("SELECT") and "CLASSES_ENROLLMENT" in sql
        ]
        self.assertEqual(response.status_code, 200)
        self.assertTrue(class_locks, statements)
        self.assertTrue(enrollment_reads, statements)
        self.assertLess(class_locks[0], enrollment_reads[0])

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


class TeacherRosterProgressTests(TestCase):
    def setUp(self):
        now = timezone.now()
        self.teacher = User.objects.create_user("teacher2@example.test", "pw", role="TEACHER")
        self.other_teacher = User.objects.create_user("other-teacher2@example.test", "pw", role="TEACHER")
        self.student = User.objects.create_user("student2@example.test", "pw", role="STUDENT")
        self.other_student = User.objects.create_user("other-student2@example.test", "pw", role="STUDENT")
        self.classroom = Class.objects.create(
            teacher=self.teacher,
            name="Roster Basics",
            starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=2),
        )
        Enrollment.objects.bulk_create([
            Enrollment(classroom=self.classroom, student=self.student),
            Enrollment(classroom=self.classroom, student=self.other_student),
        ])
        self.assignment = Assignment.objects.create(
            classroom=self.classroom,
            title="Homework 1",
            description="Solve the practice problems.",
            due_at=now + timedelta(days=1),
        )
        self.second_assignment = Assignment.objects.create(
            classroom=self.classroom,
            title="Homework 2",
            description="Solve more practice problems.",
            due_at=now + timedelta(days=1),
        )
        # self.student: submitted + graded on the first assignment, nothing on the second.
        submission = self.make_submission(self.assignment, self.student, version=1)
        Grade.objects.create(
            assignment=self.assignment,
            student=self.student,
            teacher=self.teacher,
            submission=submission,
            total_score=90,
            feedback="Great work.",
        )
        # self.other_student: no submissions at all.

        self.teacher_client = self.client_for(self.teacher)
        self.other_teacher_client = self.client_for(self.other_teacher)
        self.student_client = self.client_for(self.student)

    def make_submission(self, assignment, student, version):
        return Submission.objects.create(
            assignment=assignment,
            student=student,
            version=version,
            file_path=f"submissions/{assignment.id}-{student.id}-{version}.pdf",
            original_filename="submission.pdf",
            content_type="application/pdf",
            size=10,
            note="",
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def test_owner_teacher_sees_roster_with_backend_computed_counts(self):
        response = self.teacher_client.get(f"/api/classes/{self.classroom.id}/students")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total_assignments"], 2)
        self.assertEqual(response.data["enrolled_students"], 2)
        self.assertEqual(response.data["submitted_students"], 1)
        self.assertEqual(response.data["graded_students"], 1)
        by_id = {row["id"]: row for row in response.data["students"]}
        self.assertEqual(by_id[self.student.id]["submitted_assignments"], 1)
        self.assertEqual(by_id[self.student.id]["graded_assignments"], 1)
        # 0/total edge case: no submissions or grades at all.
        self.assertEqual(by_id[self.other_student.id]["submitted_assignments"], 0)
        self.assertEqual(by_id[self.other_student.id]["graded_assignments"], 0)

    def test_roster_search_handles_student_with_null_full_name(self):
        # self.other_student has no full_name set (None); searching must not 500.
        self.assertIsNone(self.other_student.full_name)
        self.student.full_name = "Nguyen Van A"
        self.student.save(update_fields=("full_name",))

        response = self.teacher_client.get(f"/api/classes/{self.classroom.id}/students?q=nguyen")
        self.assertEqual(response.status_code, 200)
        ids = [row["id"] for row in response.data["students"]]
        self.assertIn(self.student.id, ids)
        self.assertNotIn(self.other_student.id, ids)
        # Summary counts stay computed from the full roster, unaffected by the filter.
        self.assertEqual(response.data["enrolled_students"], 2)

        response = self.teacher_client.get(
            f"/api/classes/{self.classroom.id}/students?q={self.other_student.email}"
        )
        self.assertEqual(response.status_code, 200)
        ids = [row["id"] for row in response.data["students"]]
        self.assertEqual(ids, [self.other_student.id])

    def test_owner_teacher_sees_student_profile_with_progress(self):
        response = self.teacher_client.get(
            f"/api/classes/{self.classroom.id}/students/{self.student.id}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], self.student.id)
        self.assertEqual(response.data["total_assignments"], 2)
        self.assertEqual(response.data["submitted_assignments"], 1)
        self.assertEqual(response.data["graded_assignments"], 1)

        # 0/total edge case for a student with no activity yet.
        response = self.teacher_client.get(
            f"/api/classes/{self.classroom.id}/students/{self.other_student.id}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total_assignments"], 2)
        self.assertEqual(response.data["submitted_assignments"], 0)
        self.assertEqual(response.data["graded_assignments"], 0)

    def test_student_profile_exposes_personal_fields_and_shared_classes_only(self):
        self.student.phone = "0900000000"
        self.student.date_of_birth = "2000-01-01"
        self.student.gender = "NAM"
        self.student.address = "123 Main St"
        self.student.save(update_fields=("phone", "date_of_birth", "gender", "address"))

        other_classroom = Class.objects.create(
            teacher=self.other_teacher,
            name="Other Teacher's Class",
            starts_at=timezone.now() - timedelta(days=1),
            ends_at=timezone.now() + timedelta(days=2),
        )
        Enrollment.objects.create(classroom=other_classroom, student=self.student)

        response = self.teacher_client.get(
            f"/api/classes/{self.classroom.id}/students/{self.student.id}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["phone"], "0900000000")
        self.assertEqual(response.data["date_of_birth"], "2000-01-01")
        self.assertEqual(response.data["gender"], "NAM")
        self.assertEqual(response.data["address"], "123 Main St")
        shared_class_ids = [c["id"] for c in response.data["shared_classes"]]
        self.assertEqual(shared_class_ids, [self.classroom.id])
        self.assertNotIn(other_classroom.id, shared_class_ids)

    def test_other_teacher_gets_404_not_403_for_roster_and_profile(self):
        response = self.other_teacher_client.get(f"/api/classes/{self.classroom.id}/students")
        self.assertEqual(response.status_code, 404)

        response = self.other_teacher_client.get(
            f"/api/classes/{self.classroom.id}/students/{self.student.id}"
        )
        self.assertEqual(response.status_code, 404)

    def test_student_role_is_forbidden_from_roster_and_profile(self):
        response = self.student_client.get(f"/api/classes/{self.classroom.id}/students")
        self.assertEqual(response.status_code, 403)

        response = self.student_client.get(
            f"/api/classes/{self.classroom.id}/students/{self.student.id}"
        )
        self.assertEqual(response.status_code, 403)

    def test_unenrolled_student_id_is_404_within_owned_class(self):
        response = self.teacher_client.get(
            f"/api/classes/{self.classroom.id}/students/{self.other_teacher.id}"
        )
        self.assertEqual(response.status_code, 404)


class GradebookApiTests(TestCase):
    def setUp(self):
        now = timezone.now()
        self.teacher = User.objects.create_user("gradebook-teacher@example.test", "pw", role="TEACHER")
        self.other_teacher = User.objects.create_user("gradebook-other@example.test", "pw", role="TEACHER")
        self.admin = User.objects.create_user("gradebook-admin@example.test", "pw", role="ADMIN")
        self.student = User.objects.create_user("gradebook-student@example.test", "pw", role="STUDENT")
        self.other_student = User.objects.create_user("gradebook-other-student@example.test", "pw", role="STUDENT")
        self.classroom = Class.objects.create(
            teacher=self.teacher,
            name="Gradebook Basics",
            starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=2),
        )
        Enrollment.objects.bulk_create([
            Enrollment(classroom=self.classroom, student=self.student),
            Enrollment(classroom=self.classroom, student=self.other_student),
        ])
        self.teacher_client = self.client_for(self.teacher)
        self.other_teacher_client = self.client_for(self.other_teacher)
        self.admin_client = self.client_for(self.admin)

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def make_submission(self, assignment, student, version=1):
        return Submission.objects.create(
            assignment=assignment,
            student=student,
            version=version,
            file_path="private/submission.pdf",
            original_filename="submission.pdf",
            content_type="application/pdf",
            size=10,
            note="",
        )

    def test_assigned_teacher_gets_empty_gradebook_only(self):
        response = self.teacher_client.get(f"/api/classes/{self.classroom.id}/gradebook")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"assignments": [], "students": [
            {"id": self.student.id, "full_name": None, "email": "gradebook-student@example.test", "grades": []},
            {"id": self.other_student.id, "full_name": None, "email": "gradebook-other-student@example.test", "grades": []},
        ]})
        self.assertEqual(
            self.other_teacher_client.get(f"/api/classes/{self.classroom.id}/gradebook").status_code,
            404,
        )
        self.assertEqual(
            self.admin_client.get(f"/api/classes/{self.classroom.id}/gradebook").status_code,
            403,
        )

    def test_gradebook_reports_every_student_assignment_state_and_score(self):
        now = timezone.now()
        open_assignment = Assignment.objects.create(
            classroom=self.classroom, title="Open", description="x", due_at=now + timedelta(days=1)
        )
        submitted_assignment = Assignment.objects.create(
            classroom=self.classroom, title="Submitted", description="x", due_at=now + timedelta(days=1)
        )
        graded_assignment = Assignment.objects.create(
            classroom=self.classroom, title="Graded", description="x", due_at=now + timedelta(days=1)
        )
        closed_assignment = Assignment.objects.create(
            classroom=self.classroom, title="Closed", description="x", due_at=now - timedelta(seconds=1)
        )
        self.make_submission(submitted_assignment, self.student)
        self.make_submission(graded_assignment, self.student, version=1)
        graded_submission = self.make_submission(graded_assignment, self.student, version=2)
        Grade.objects.create(
            assignment=graded_assignment,
            student=self.student,
            teacher=self.teacher,
            submission=graded_submission,
            total_score=88,
            feedback="Nice work.",
        )

        response = self.teacher_client.get(f"/api/classes/{self.classroom.id}/gradebook")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["assignments"], [
            {"id": open_assignment.id, "title": "Open", "maximum_score": 100},
            {"id": submitted_assignment.id, "title": "Submitted", "maximum_score": 100},
            {"id": graded_assignment.id, "title": "Graded", "maximum_score": 100},
            {"id": closed_assignment.id, "title": "Closed", "maximum_score": 100},
        ])
        self.assertEqual(response.data["students"][0]["grades"], [
            {"assignment_id": open_assignment.id, "learning_state": "OPEN", "score": None},
            {"assignment_id": submitted_assignment.id, "learning_state": "SUBMITTED", "score": None},
            {"assignment_id": graded_assignment.id, "learning_state": "GRADED", "score": 88},
            {"assignment_id": closed_assignment.id, "learning_state": "CLOSED", "score": None},
        ])
        self.assertEqual(
            response.data["students"][1]["grades"],
            [{"assignment_id": assignment.id, "learning_state": "OPEN" if assignment != closed_assignment else "CLOSED", "score": None}
             for assignment in (open_assignment, submitted_assignment, graded_assignment, closed_assignment)],
        )

    def test_gradebook_csv_is_utf8_private_safe_and_matches_roster(self):
        self.student.full_name = "Nguyễn Văn A"
        self.student.save(update_fields=("full_name",))
        assignment = Assignment.objects.create(
            classroom=self.classroom,
            title="Essay",
            description="x",
            due_at=timezone.now() + timedelta(days=1),
        )
        submission = self.make_submission(assignment, self.student)
        Grade.objects.create(
            assignment=assignment,
            student=self.student,
            teacher=self.teacher,
            submission=submission,
            total_score=91,
            feedback="Good.",
        )

        response = self.teacher_client.get(f"/api/classes/{self.classroom.id}/gradebook.csv")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
        self.assertTrue(response.content.startswith(b"\xef\xbb\xbf"))
        content = response.content.decode("utf-8-sig")
        self.assertIn("Họ tên,Email,Essay (100)\r\n", content)
        self.assertIn("Nguyễn Văn A,gradebook-student@example.test,GRADED: 91\r\n", content)
        self.assertIn(",gradebook-other-student@example.test,OPEN\r\n", content)
        self.assertNotIn("file_path", content)
        self.assertNotIn("private/submission.pdf", content)
