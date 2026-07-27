from django.contrib.auth.hashers import check_password, make_password
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class DemoSeedMigrationTests(TransactionTestCase):
    reset_sequences = True

    def test_seed_migration_creates_loginable_demo_data(self):
        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0001_initial"), ("cohorts", "0001_initial")])
        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0002_seed_demo_data")])

        apps = executor.loader.project_state([("accounts", "0002_seed_demo_data")]).apps
        User = apps.get_model("accounts", "User")
        Cohort = apps.get_model("cohorts", "Cohort")
        Enrollment = apps.get_model("cohorts", "Enrollment")
        admin = User.objects.get(email="phong@gmail.com")

        self.assertTrue(check_password("Admin@123", admin.password))
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)
        self.assertEqual(User.objects.filter(role="TEACHER").count(), 2)
        self.assertEqual(User.objects.filter(role="STUDENT").count(), 4)
        self.assertEqual(Cohort.objects.count(), 2)
        self.assertEqual(Enrollment.objects.count(), 4)

    def test_seed_migration_keeps_an_existing_admin_unchanged(self):
        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0001_initial"), ("cohorts", "0001_initial")])
        apps = executor.loader.project_state([("accounts", "0001_initial")]).apps
        User = apps.get_model("accounts", "User")
        User.objects.create(
            email="phong@gmail.com", password=make_password("Existing@123"), role="ADMIN"
        )

        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0002_seed_demo_data")])
        apps = executor.loader.project_state([("accounts", "0002_seed_demo_data")]).apps
        User = apps.get_model("accounts", "User")

        self.assertTrue(
            check_password("Existing@123", User.objects.get(email="phong@gmail.com").password)
        )
