from django.utils import timezone
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from notifications.models import Notification


class NotificationApiTests(TestCase):
    def setUp(self):
        self.student = User.objects.create_user("student@example.test", "pw", role="STUDENT")
        self.other = User.objects.create_user("other@example.test", "pw", role="STUDENT")
        self.read = Notification.objects.create(
            recipient=self.student, type="ASSIGNMENT_CREATED", title="New assignment: Lab 1",
            link="/student/assignments/1", read_at=timezone.now(),
        )
        self.unread = Notification.objects.create(
            recipient=self.student, type="RESOURCE_CREATED", title="New resource: Slides",
            link="/student/classes/1",
        )
        self.client = APIClient()

    def authenticate(self, user):
        self.client.force_authenticate(user=user)
        return self.client

    def test_list_returns_unread_count_and_own_rows_only(self):
        Notification.objects.create(recipient=self.other, type="ASSIGNMENT_CREATED", title="Not mine", link="/x")
        response = self.authenticate(self.student).get("/api/notifications")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["unread_count"], 1)
        self.assertEqual([item["title"] for item in response.data["items"]],
                         ["New resource: Slides", "New assignment: Lab 1"])

    def test_list_requires_authentication(self):
        self.assertEqual(APIClient().get("/api/notifications").status_code, 401)

    def test_read_is_idempotent_and_scoped_to_the_recipient(self):
        client = self.authenticate(self.student)
        first = client.post(f"/api/notifications/{self.unread.id}/read")
        self.assertEqual(first.status_code, 200)
        marked_at = first.data["read_at"]
        self.assertIsNotNone(marked_at)
        second = client.post(f"/api/notifications/{self.unread.id}/read")
        self.assertEqual(second.data["read_at"], marked_at)
        self.assertEqual(self.authenticate(self.other)
                         .post(f"/api/notifications/{self.unread.id}/read").status_code, 404)

    def test_a_row_can_be_stored_without_a_link(self):
        Notification.objects.create(
            recipient=self.student, type="CLASS_UNASSIGNED", title="Unassigned from Cohort 5", link=None,
        )
        item = self.authenticate(self.student).get("/api/notifications").data["items"][0]
        self.assertEqual(item["type"], "CLASS_UNASSIGNED")
        self.assertIsNone(item["link"])

    def test_rows_created_in_one_bulk_write_keep_a_stable_newest_first_order(self):
        stamp = timezone.now()
        rows = Notification.objects.bulk_create([
            Notification(recipient=self.student, type="ASSIGNMENT_CREATED", title=f"Bulk {index}", link="/x")
            for index in range(3)
        ])
        Notification.objects.filter(id__in=[row.id for row in rows]).update(created_at=stamp)
        titles = [item["title"] for item in
                  self.authenticate(self.student).get("/api/notifications").data["items"][:3]]
        self.assertEqual(titles, ["Bulk 2", "Bulk 1", "Bulk 0"])

    def test_serializer_exposes_type_and_created_at(self):
        item = self.authenticate(self.student).get("/api/notifications").data["items"][0]
        self.assertEqual(
            set(item), {"id", "type", "title", "link", "created_at", "read_at"},
        )
