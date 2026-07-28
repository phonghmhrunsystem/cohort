from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory

from django.conf import settings
from django.test import TestCase, override_settings
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from accounts.models import User
from assignments.models import Assignment
from classes.models import Class, Enrollment


class SubmissionApiTests(TestCase):
    def setUp(self):
        self.media = TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        self.media_override = override_settings(MEDIA_ROOT=self.media.name)
        self.media_override.enable()
        self.addCleanup(self.media_override.disable)
        now = timezone.now()
        self.teacher = User.objects.create_user("teacher@example.test", "pw", role="TEACHER")
        self.student = User.objects.create_user("student@example.test", "pw", role="STUDENT")
        self.other_student = User.objects.create_user("other@example.test", "pw", role="STUDENT")
        self.unenrolled_student = User.objects.create_user("unenrolled@example.test", "pw", role="STUDENT")
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
        self.assignment = Assignment.objects.create(
            classroom=self.classroom,
            title="Final project",
            description="Build and document a small application.",
            due_at=now + timedelta(days=1),
        )
        self.teacher_client = self.client_for(self.teacher)
        self.student_client = self.client_for(self.student)
        self.other_student_client = self.client_for(self.other_student)
        self.unenrolled_student_client = self.client_for(self.unenrolled_student)
        self.submit_url = f"/api/assignments/{self.assignment.id}/submissions"
        self.teacher_list_url = self.submit_url

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def submit(self, filename, *, client=None):
        return (client or self.student_client).post(
            self.submit_url,
            {"file": SimpleUploadedFile(filename, b"content", self.content_type(filename))},
            format="multipart",
        )

    def content_type(self, filename):
        return {
            "pdf": "application/pdf",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }[filename.rsplit(".", 1)[1]]

    def test_invalid_upload_writes_no_file_or_row(self):
        before = list(Path(settings.MEDIA_ROOT).rglob("*"))

        response = self.student_client.post(
            self.submit_url,
            {"file": SimpleUploadedFile("bad.txt", b"x", "text/plain")},
            format="multipart",
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(list(Path(settings.MEDIA_ROOT).rglob("*")), before)
        from submissions.models import Submission
        self.assertEqual(Submission.objects.count(), 0)

    def test_student_history_lists_versions_newest_first(self):
        self.assertEqual(self.submit("one.pdf").status_code, 201)
        self.assertEqual(self.submit("two.pdf").status_code, 201)

        response = self.student_client.get(self.submit_url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["version"] for item in response.json()], [2, 1])
        self.assertNotIn("file_path", response.json()[0])

    def test_teacher_sees_only_greatest_version_per_student(self):
        self.submit("one.pdf")
        self.submit("two.pdf")
        self.submit("other.docx", client=self.other_student_client)

        response = self.teacher_client.get(self.teacher_list_url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            {(item["student_id"], item["version"]) for item in response.json()},
            {(self.student.id, 2), (self.other_student.id, 1)},
        )

    def test_late_and_unenrolled_students_cannot_submit(self):
        self.assignment.due_at = timezone.now() - timedelta(seconds=1)
        self.assignment.save(update_fields=("due_at",))
        self.assertEqual(self.submit("late.pdf").status_code, 422)

        self.assignment.due_at = timezone.now() + timedelta(days=1)
        self.assignment.save(update_fields=("due_at",))
        self.assertEqual(
            self.submit("unenrolled.pdf", client=self.unenrolled_student_client).status_code,
            404,
        )

    def test_graded_student_cannot_submit_or_write_a_file_or_row(self):
        from assignments.models import AssignmentGrade
        from submissions.models import Submission

        AssignmentGrade.objects.create(
            assignment=self.assignment, student=self.student, score=90
        )
        before = list(Path(settings.MEDIA_ROOT).rglob("*"))

        response = self.submit("graded.pdf")

        self.assertEqual(response.status_code, 422)
        self.assertEqual(Submission.objects.count(), 0)
        self.assertEqual(list(Path(settings.MEDIA_ROOT).rglob("*")), before)

    def test_download_is_limited_to_submitter_or_assigned_teacher(self):
        submission = self.submit("one.pdf").json()
        download_url = f"/api/submissions/{submission['id']}/download"

        student_download = self.student_client.get(download_url)
        teacher_download = self.teacher_client.get(download_url)
        self.assertEqual(student_download.status_code, 200)
        self.assertEqual(teacher_download.status_code, 200)
        student_download.close()
        teacher_download.close()
        self.assertEqual(self.other_student_client.get(download_url).status_code, 404)
        self.assertEqual(self.unenrolled_student_client.get(download_url).status_code, 404)
