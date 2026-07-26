from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditLog


class AccountApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            "admin@example.test", "pw", role="ADMIN"
        )
        self.student = User.objects.create_user(
            "student@example.test", "pw", role="STUDENT"
        )
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(self.admin)

    def test_inactive_user_cannot_obtain_token(self):
        user = User.objects.create_user(
            "inactive@example.test", "pw", role="STUDENT", is_active=False
        )

        response = self.client.post(
            "/api/auth/login", {"email": user.email, "password": "pw"}
        )

        self.assertEqual(response.status_code, 401)

    def test_account_change_writes_audit_row(self):
        self.admin_client.patch(f"/api/users/{self.student.id}", {"is_active": False})

        self.assertEqual(AuditLog.objects.get().action, "account.updated")
