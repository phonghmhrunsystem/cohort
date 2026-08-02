from datetime import timedelta

from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from classes.models import Class, ClassResource, Enrollment
from notifications.models import Notification

PDF = b"%PDF-1.4 hello"


def pdf_upload(name="slides.pdf", body=PDF):
    return SimpleUploadedFile(name, body, content_type="application/octet-stream")


class ClassResourceCrudTests(TestCase):
    def setUp(self):
        now = timezone.now()
        self.teacher = User.objects.create_user("res-teacher@example.test", "pw", role=User.Role.TEACHER)
        self.other_teacher = User.objects.create_user("res-other@example.test", "pw", role=User.Role.TEACHER)
        self.student = User.objects.create_user("res-student@example.test", "pw", role=User.Role.STUDENT)
        self.outsider = User.objects.create_user("res-outsider@example.test", "pw", role=User.Role.STUDENT)
        self.admin = User.objects.create_user("res-admin@example.test", "pw", role=User.Role.ADMIN)
        self.course = Class.objects.create(
            teacher=self.teacher, name="Resources", starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=30)
        )
        Enrollment.objects.create(classroom=self.course, student=self.student)
        self.client_teacher = APIClient(); self.client_teacher.force_authenticate(self.teacher)
        self.client_other = APIClient(); self.client_other.force_authenticate(self.other_teacher)
        self.client_student = APIClient(); self.client_student.force_authenticate(self.student)
        self.client_outsider = APIClient(); self.client_outsider.force_authenticate(self.outsider)
        self.client_admin = APIClient(); self.client_admin.force_authenticate(self.admin)
        self.url = f"/api/classes/{self.course.id}/resources"
        self.stored = []

    def tearDown(self):
        for path in self.stored:
            if default_storage.exists(path): default_storage.delete(path)

    def create_file_resource(self, title="Giáo trình", name="slides.pdf", body=PDF):
        response = self.client_teacher.post(
            self.url, {"title": title, "description": "", "file": pdf_upload(name, body)}, format="multipart"
        )
        if response.status_code == 201:
            self.stored.append(ClassResource.objects.get(id=response.data["id"]).file_path)
        return response

    def test_link_and_file_resources_are_both_created(self):
        link = self.client_teacher.post(self.url, {"title": "Slide deck", "url": "https://example.test/s"}, format="json")
        self.assertEqual(link.status_code, 201)
        self.assertEqual(link.data["kind"], "link")

        upload = self.create_file_resource()
        self.assertEqual(upload.status_code, 201)
        self.assertEqual(upload.data["kind"], "file")
        self.assertEqual(upload.data["original_filename"], "slides.pdf")
        self.assertEqual(upload.data["content_type"], "application/pdf")
        self.assertEqual(upload.data["size"], len(PDF))
        self.assertEqual(upload.data["url"], "")
        # Both creations fan out to the roster.
        self.assertEqual(Notification.objects.filter(recipient=self.student, type="RESOURCE_CREATED").count(), 2)

    def test_a_resource_must_carry_exactly_one_source(self):
        neither = self.client_teacher.post(self.url, {"title": "Nothing"}, format="json")
        self.assertEqual(neither.status_code, 422)
        both = self.client_teacher.post(
            self.url, {"title": "Both", "url": "https://example.test/s", "file": pdf_upload()}, format="multipart"
        )
        self.assertEqual(both.status_code, 422)
        self.assertEqual(ClassResource.objects.count(), 0)

    def test_uploads_are_rejected_by_extension_size_and_magic_bytes(self):
        wrong_extension = self.create_file_resource(name="malware.exe", body=b"MZ")
        self.assertEqual(wrong_extension.status_code, 422)

        wrong_magic = self.create_file_resource(name="fake.pdf", body=b"not a pdf at all")
        self.assertEqual(wrong_magic.status_code, 422)

        with self.settings(MAX_UPLOAD_BYTES=4):
            too_big = self.create_file_resource()
            self.assertEqual(too_big.status_code, 422)
        self.assertEqual(ClassResource.objects.count(), 0)

    def test_patch_renames_without_notifying(self):
        created = self.client_teacher.post(self.url, {"title": "Old", "url": "https://example.test/s"}, format="json")
        Notification.objects.all().delete()
        response = self.client_teacher.patch(
            f"{self.url}/{created.data['id']}", {"title": "New title"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "New title")
        self.assertEqual(response.data["url"], "https://example.test/s")
        self.assertEqual(Notification.objects.count(), 0)

    def test_patch_switches_between_a_link_and_a_file_in_both_directions(self):
        link = self.client_teacher.post(self.url, {"title": "Link", "url": "https://example.test/s"}, format="json")
        to_file = self.client_teacher.patch(
            f"{self.url}/{link.data['id']}", {"file": pdf_upload()}, format="multipart"
        )
        self.assertEqual(to_file.status_code, 200)
        self.assertEqual(to_file.data["kind"], "file")
        self.assertEqual(to_file.data["url"], "")
        replaced = ClassResource.objects.get(id=link.data["id"]).file_path
        self.stored.append(replaced)

        back_to_link = self.client_teacher.patch(
            f"{self.url}/{link.data['id']}", {"url": "https://example.test/other"}, format="json"
        )
        self.assertEqual(back_to_link.data["kind"], "link")
        self.assertEqual(back_to_link.data["original_filename"], "")
        self.assertIsNone(back_to_link.data["size"])
        # The bytes the row no longer points at are gone from disk.
        self.assertFalse(default_storage.exists(replaced))

    def test_patch_cannot_blank_the_only_source_a_resource_has(self):
        created = self.client_teacher.post(self.url, {"title": "Link", "url": "https://example.test/s"}, format="json")
        response = self.client_teacher.patch(f"{self.url}/{created.data['id']}", {"url": ""}, format="json")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(ClassResource.objects.get(id=created.data["id"]).url, "https://example.test/s")

    def test_patch_keeps_the_current_file_when_no_new_one_is_sent(self):
        created = self.create_file_resource()
        stored = ClassResource.objects.get(id=created.data["id"]).file_path
        response = self.client_teacher.patch(f"{self.url}/{created.data['id']}", {"title": "Renamed"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["kind"], "file")
        self.assertEqual(ClassResource.objects.get(id=created.data["id"]).file_path, stored)
        self.assertTrue(default_storage.exists(stored))

    def test_delete_removes_the_row_and_the_stored_file(self):
        created = self.create_file_resource()
        stored = ClassResource.objects.get(id=created.data["id"]).file_path
        response = self.client_teacher.delete(f"{self.url}/{created.data['id']}")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(ClassResource.objects.count(), 0)
        self.assertFalse(default_storage.exists(stored))
        self.assertEqual(self.client_teacher.delete(f"{self.url}/{created.data['id']}").status_code, 404)

    def test_only_the_owning_teacher_can_write(self):
        created = self.client_teacher.post(self.url, {"title": "Link", "url": "https://example.test/s"}, format="json")
        detail = f"{self.url}/{created.data['id']}"
        for client in (self.client_other, self.client_student, self.client_admin):
            self.assertEqual(client.post(self.url, {"title": "Nope", "url": "https://example.test/x"}, format="json").status_code, 404)
            self.assertEqual(client.patch(detail, {"title": "Nope"}, format="json").status_code, 404)
            self.assertEqual(client.delete(detail).status_code, 404)

    def test_download_serves_the_file_to_the_class_and_nobody_else(self):
        created = self.create_file_resource()
        download = f"{self.url}/{created.data['id']}/download"

        response = self.client_student.get(download)
        self.assertEqual(response.status_code, 200)
        self.assertIn("attachment", response["Content-Disposition"])
        self.assertIn("slides.pdf", response["Content-Disposition"])
        self.assertEqual(b"".join(response.streaming_content), PDF)
        # FileResponse keeps the handle open; Windows will not let tearDown
        # delete a file that is still open.
        response.close()

        teacher_response = self.client_teacher.get(download)
        self.assertEqual(teacher_response.status_code, 200)
        teacher_response.close()
        self.assertEqual(self.client_outsider.get(download).status_code, 404)
        # Resources are course material, not an admin surface (07 §3).
        self.assertEqual(self.client_admin.get(download).status_code, 403)

    def test_downloading_a_link_resource_is_a_404(self):
        created = self.client_teacher.post(self.url, {"title": "Link", "url": "https://example.test/s"}, format="json")
        self.assertEqual(self.client_student.get(f"{self.url}/{created.data['id']}/download").status_code, 404)
