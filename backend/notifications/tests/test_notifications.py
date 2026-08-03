from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from classes.models import Class, Enrollment
from notifications.models import Notification
from notifications.services import create_notifications, notify_user


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

    def test_unread_count_matches_the_list_and_is_scoped_to_the_caller(self):
        Notification.objects.create(recipient=self.other, type="ASSIGNMENT_CREATED", title="Not mine", link="/x")
        response = self.authenticate(self.student).get("/api/notifications/unread-count")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"unread_count": 1})

        empty = self.authenticate(self.other).get("/api/notifications/unread-count")
        self.assertEqual(empty.data["unread_count"], 1)
        self.authenticate(self.other).post("/api/notifications/read-all")
        self.assertEqual(self.authenticate(self.other).get("/api/notifications/unread-count").data["unread_count"], 0)
        # Marking the other user's rows read leaves this user's badge alone.
        self.assertEqual(self.authenticate(self.student).get("/api/notifications/unread-count").data["unread_count"], 1)

    def test_unread_count_requires_authentication(self):
        self.assertEqual(APIClient().get("/api/notifications/unread-count").status_code, 401)

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

    def test_read_all_clears_every_unread_row_of_the_caller_only(self):
        mine = Notification.objects.create(
            recipient=self.student, type="ASSIGNMENT_CREATED", title="Second unread", link="/x",
        )
        theirs = Notification.objects.create(
            recipient=self.other, type="ASSIGNMENT_CREATED", title="Theirs", link="/x",
        )
        response = self.authenticate(self.student).post("/api/notifications/read-all")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"unread_count": 0})
        self.unread.refresh_from_db(); mine.refresh_from_db(); theirs.refresh_from_db()
        self.assertIsNotNone(self.unread.read_at)
        self.assertIsNotNone(mine.read_at)
        self.assertIsNone(theirs.read_at)

    def test_read_all_is_idempotent_and_does_not_move_an_existing_read_at(self):
        client = self.authenticate(self.student)
        client.post("/api/notifications/read-all")
        first_read_at = Notification.objects.get(id=self.read.id).read_at
        self.assertEqual(client.post("/api/notifications/read-all").data, {"unread_count": 0})
        self.assertEqual(Notification.objects.get(id=self.read.id).read_at, first_read_at)

    def test_read_all_requires_authentication(self):
        self.assertEqual(APIClient().post("/api/notifications/read-all").status_code, 401)

    def test_serializer_exposes_type_and_created_at(self):
        item = self.authenticate(self.student).get("/api/notifications").data["items"][0]
        self.assertEqual(
            set(item), {"id", "type", "title", "link", "created_at", "read_at"},
        )


class FanOutTests(TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user("t@example.test", "pw", role="TEACHER")
        self.enrolled = User.objects.create_user("a@example.test", "pw", role="STUDENT")
        self.disabled = User.objects.create_user("b@example.test", "pw", role="STUDENT")
        self.disabled.is_active = False
        self.disabled.save(update_fields=("is_active",))
        self.outsider = User.objects.create_user("c@example.test", "pw", role="STUDENT")
        self.class_ = Class.objects.create(
            name="Cohort 5", teacher=self.teacher,
            starts_at=timezone.now(), ends_at=timezone.now() + timedelta(days=30),
        )
        Enrollment.objects.create(classroom=self.class_, student=self.enrolled)
        Enrollment.objects.create(classroom=self.class_, student=self.disabled)

    def test_fan_out_reaches_the_whole_roster_including_disabled_accounts(self):
        create_notifications(self.class_, "ASSIGNMENT_CREATED", "New assignment: Lab 1", "/student/assignments/1")
        recipients = set(Notification.objects.values_list("recipient_id", flat=True))
        self.assertEqual(recipients, {self.enrolled.id, self.disabled.id})

    def test_a_student_enrolled_after_the_fan_out_gets_nothing_retroactively(self):
        create_notifications(self.class_, "ASSIGNMENT_CREATED", "New assignment: Lab 1", "/student/assignments/1")
        Enrollment.objects.create(classroom=self.class_, student=self.outsider)
        self.assertFalse(Notification.objects.filter(recipient=self.outsider).exists())

    def test_a_rolled_back_transaction_leaves_no_orphan_fan_out(self):
        try:
            with transaction.atomic():
                create_notifications(self.class_, "ASSIGNMENT_CREATED", "New assignment: Lab 1", "/student/assignments/1")
                raise RuntimeError("the domain write failed")
        except RuntimeError:
            pass
        self.assertFalse(Notification.objects.exists())

    def test_notify_user_writes_one_row_for_a_teacher_who_is_not_enrolled(self):
        notify_user(self.teacher, "CLASS_ASSIGNED", "Assigned to Cohort 5", f"/teacher/classes/{self.class_.id}")
        self.assertEqual(Notification.objects.filter(recipient=self.teacher).count(), 1)
