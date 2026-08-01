from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from assignments.models import Assignment, RubricCriterion
from classes.models import Class, Enrollment
from grading.models import Grade
from submissions.models import Submission


class GradingApiTests(TestCase):
    def setUp(self):
        now = timezone.now()
        self.teacher = User.objects.create_user("teacher@example.test", "pw", role="TEACHER")
        self.other_teacher = User.objects.create_user("other-teacher@example.test", "pw", role="TEACHER")
        self.student = User.objects.create_user("student@example.test", "pw", role="STUDENT")
        self.other_student = User.objects.create_user("other-student@example.test", "pw", role="STUDENT")
        self.classroom = Class.objects.create(
            teacher=self.teacher,
            name="Python Basics",
            starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=2),
        )
        Enrollment.objects.bulk_create([
            Enrollment(classroom=self.classroom, student=self.student),
            Enrollment(classroom=self.classroom, student=self.other_student),
        ])

        # Rubric assignment with two criteria (40 + 50 max points available).
        self.assignment = Assignment.objects.create(
            classroom=self.classroom,
            title="Final project",
            description="Build and document a small application.",
            due_at=now + timedelta(days=1),
        )
        self.c1 = RubricCriterion.objects.create(assignment=self.assignment, title="Correctness", maximum_score=50)
        self.c2 = RubricCriterion.objects.create(assignment=self.assignment, title="Style", maximum_score=50)

        # Manual (no rubric) assignment.
        self.manual_assignment = Assignment.objects.create(
            classroom=self.classroom,
            title="Reading response",
            description="Write a short reflection on the reading.",
            due_at=now + timedelta(days=1),
        )

        self.old_submission = self.make_submission(self.assignment, self.student, version=1)
        self.submission = self.make_submission(self.assignment, self.student, version=2)
        self.manual_submission = self.make_submission(self.manual_assignment, self.student, version=1)

        self.teacher_client = self.client_for(self.teacher)
        self.other_teacher_client = self.client_for(self.other_teacher)
        self.student_client = self.client_for(self.student)
        self.other_student_client = self.client_for(self.other_student)

        self.grade_url = f"/api/submissions/{self.submission.id}/grade"
        self.old_submission_grade_url = f"/api/submissions/{self.old_submission.id}/grade"
        self.manual_grade_url = f"/api/submissions/{self.manual_submission.id}/grade"
        self.my_result_url = f"/api/assignments/{self.assignment.id}/my-result"
        self.manual_my_result_url = f"/api/assignments/{self.manual_assignment.id}/my-result"

    def make_submission(self, assignment, student, version):
        return Submission.objects.create(
            assignment=assignment,
            student=student,
            version=version,
            file_path=f"submissions/{assignment.id}-{student.id}-{version}.pdf",
            original_filename="submission.pdf",
            content_type="application/pdf",
            size=10,
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    # -- rubric grading --------------------------------------------------

    def test_rubric_grade_total_is_calculated_server_side(self):
        response = self.teacher_client.put(
            self.grade_url,
            {
                "feedback": "Good work",
                "scores": [
                    {"criterion_id": self.c1.id, "score": 40},
                    {"criterion_id": self.c2.id, "score": 50},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total_score"], 90)
        self.assertEqual(Grade.objects.get(assignment=self.assignment).total_score, 90)

    def test_client_submitted_total_is_ignored_for_rubric_grade(self):
        response = self.teacher_client.put(
            self.grade_url,
            {
                "feedback": "Good work",
                "total_score": 1,
                "scores": [
                    {"criterion_id": self.c1.id, "score": 40},
                    {"criterion_id": self.c2.id, "score": 50},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total_score"], 90)

    def test_rubric_score_out_of_criterion_range_is_rejected(self):
        response = self.teacher_client.put(
            self.grade_url,
            {
                "feedback": "Good work",
                "scores": [
                    {"criterion_id": self.c1.id, "score": 999},
                    {"criterion_id": self.c2.id, "score": 50},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 422)
        self.assertFalse(Grade.objects.exists())

    def test_missing_criterion_score_is_rejected(self):
        response = self.teacher_client.put(
            self.grade_url,
            {"feedback": "Good work", "scores": [{"criterion_id": self.c1.id, "score": 40}]},
            format="json",
        )
        self.assertEqual(response.status_code, 422)
        self.assertFalse(Grade.objects.exists())

    def test_unknown_criterion_id_is_rejected(self):
        response = self.teacher_client.put(
            self.grade_url,
            {
                "feedback": "Good work",
                "scores": [
                    {"criterion_id": self.c1.id, "score": 40},
                    {"criterion_id": 999999, "score": 50},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 422)
        self.assertFalse(Grade.objects.exists())

    def test_blank_feedback_is_rejected_for_rubric_grade(self):
        response = self.teacher_client.put(
            self.grade_url,
            {
                "feedback": "   ",
                "scores": [
                    {"criterion_id": self.c1.id, "score": 40},
                    {"criterion_id": self.c2.id, "score": 50},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 422)
        self.assertFalse(Grade.objects.exists())

    def test_only_latest_submission_can_be_graded(self):
        response = self.teacher_client.put(self.old_submission_grade_url, {"total_score": 80, "feedback": "x"})
        self.assertEqual(response.status_code, 422)
        self.assertFalse(Grade.objects.exists())

    # -- manual grading ----------------------------------------------------

    def test_manual_grade_within_range_is_accepted(self):
        response = self.teacher_client.put(self.manual_grade_url, {"total_score": 85, "feedback": "Nice reflection"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total_score"], 85)

    def test_manual_grade_above_100_is_rejected(self):
        response = self.teacher_client.put(self.manual_grade_url, {"total_score": 150, "feedback": "x"})
        self.assertEqual(response.status_code, 422)
        self.assertFalse(Grade.objects.exists())

    def test_manual_grade_requires_feedback(self):
        response = self.teacher_client.put(self.manual_grade_url, {"total_score": 85, "feedback": ""})
        self.assertEqual(response.status_code, 422)
        self.assertFalse(Grade.objects.exists())

    def test_scores_rejected_for_assignment_without_rubric(self):
        response = self.teacher_client.put(
            self.manual_grade_url,
            {"feedback": "x", "scores": [{"criterion_id": self.c1.id, "score": 10}]},
            format="json",
        )
        self.assertEqual(response.status_code, 422)
        self.assertFalse(Grade.objects.exists())

    # -- ownership / lock / privacy ----------------------------------------

    def test_unrelated_teacher_cannot_grade(self):
        response = self.other_teacher_client.put(self.grade_url, {"total_score": 90, "feedback": "x"})
        self.assertEqual(response.status_code, 404)

    def test_student_cannot_grade(self):
        response = self.student_client.put(self.grade_url, {"total_score": 90, "feedback": "x"})
        self.assertEqual(response.status_code, 403)

    def test_grading_locks_out_further_submissions(self):
        self.teacher_client.put(
            self.grade_url,
            {
                "feedback": "Good work",
                "scores": [
                    {"criterion_id": self.c1.id, "score": 40},
                    {"criterion_id": self.c2.id, "score": 50},
                ],
            },
            format="json",
        )
        response = self.student_client.post(
            f"/api/assignments/{self.assignment.id}/submissions",
            {"file": self.upload_file()},
            format="multipart",
        )
        self.assertEqual(response.status_code, 422)

    def test_grading_twice_is_rejected(self):
        self.teacher_client.put(
            self.grade_url,
            {
                "feedback": "Good work",
                "scores": [
                    {"criterion_id": self.c1.id, "score": 40},
                    {"criterion_id": self.c2.id, "score": 50},
                ],
            },
            format="json",
        )
        response = self.teacher_client.put(
            self.grade_url,
            {
                "feedback": "Again",
                "scores": [
                    {"criterion_id": self.c1.id, "score": 10},
                    {"criterion_id": self.c2.id, "score": 10},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(Grade.objects.filter(assignment=self.assignment).count(), 1)

    def upload_file(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        return SimpleUploadedFile("resubmit.pdf", b"content", "application/pdf")

    def test_own_result_shows_total_feedback_and_criterion_breakdown(self):
        self.teacher_client.put(
            self.grade_url,
            {
                "feedback": "Good work",
                "scores": [
                    {"criterion_id": self.c1.id, "score": 40},
                    {"criterion_id": self.c2.id, "score": 50},
                ],
            },
            format="json",
        )

        response = self.student_client.get(self.my_result_url)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total_score"], 90)
        self.assertEqual(body["feedback"], "Good work")
        self.assertEqual(
            {(item["criterion_id"], item["score"]) for item in body["scores"]},
            {(self.c1.id, 40), (self.c2.id, 50)},
        )

    def test_result_is_private_to_owning_student(self):
        self.teacher_client.put(
            self.grade_url,
            {
                "feedback": "Good work",
                "scores": [
                    {"criterion_id": self.c1.id, "score": 40},
                    {"criterion_id": self.c2.id, "score": 50},
                ],
            },
            format="json",
        )

        self.assertEqual(self.other_student_client.get(self.my_result_url).status_code, 404)
        self.assertEqual(self.teacher_client.get(self.my_result_url).status_code, 403)

    def test_result_missing_before_grading(self):
        self.assertEqual(self.student_client.get(self.my_result_url).status_code, 404)

    # -- teacher grade review --------------------------------------------

    def result_url(self, assignment, student):
        return f"/api/assignments/{assignment.id}/students/{student.id}/result"

    def grade_the_submission(self):
        return self.teacher_client.put(
            self.grade_url,
            {
                "feedback": "Solid work.",
                "scores": [
                    {"criterion_id": self.c1.id, "score": 45},
                    {"criterion_id": self.c2.id, "score": 40},
                ],
            },
            format="json",
        )

    def test_teacher_reads_back_a_grade_with_feedback_and_criteria(self):
        self.grade_the_submission()

        response = self.teacher_client.get(self.result_url(self.assignment, self.student))

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total_score"], 85)
        self.assertEqual(body["feedback"], "Solid work.")
        self.assertEqual(
            [(item["criterion_title"], item["score"], item["maximum_score"]) for item in body["scores"]],
            [("Correctness", 45, 50), ("Style", 40, 50)],
        )

    def test_teacher_of_another_class_cannot_read_the_grade(self):
        self.grade_the_submission()

        response = self.other_teacher_client.get(self.result_url(self.assignment, self.student))

        self.assertEqual(response.status_code, 404)

    def test_student_cannot_use_the_teacher_result_endpoint(self):
        self.grade_the_submission()

        response = self.student_client.get(self.result_url(self.assignment, self.student))

        self.assertEqual(response.status_code, 403)

    def test_reading_an_ungraded_submission_returns_404(self):
        response = self.teacher_client.get(self.result_url(self.assignment, self.student))

        self.assertEqual(response.status_code, 404)
