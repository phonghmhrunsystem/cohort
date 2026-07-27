from django.contrib.auth.hashers import check_password, make_password
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.migrations.recorder import MigrationRecorder
from django.test import TestCase, TransactionTestCase


class MigrationHistoryCompatibilityTests(TestCase):
    def test_legacy_accounts_seed_history_is_consistent_before_class_upgrade(self):
        MigrationRecorder.Migration.objects.filter(
            app__in=("assignments", "classes")
        ).delete()
        MigrationRecorder.Migration.objects.filter(
            app="cohorts", name="0002_remove_legacy_models"
        ).delete()

        MigrationExecutor(connection).loader.check_consistent_history(connection)


class DemoSeedMigrationTests(TransactionTestCase):
    reset_sequences = True

    def test_legacy_upgrade_preserves_seeded_and_existing_data(self):
        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0001_initial"), ("classes", None)])
        with connection.cursor() as cursor:
            cursor.execute("DROP TABLE IF EXISTS classes_enrollment")
            cursor.execute("DROP TABLE IF EXISTS classes_class")
            cursor.execute("DELETE FROM django_migrations WHERE app = 'classes'")
            cursor.execute("CREATE TABLE cohorts_cohort (id integer primary key, name varchar(255) not null, description text not null, teacher_id bigint not null)")
            cursor.execute("CREATE TABLE cohorts_enrollment (id integer primary key, cohort_id bigint not null, student_id bigint not null)")

        apps = executor.loader.project_state(
            [("accounts", "0001_initial"), ("cohorts", "0001_initial")]
        ).apps
        User = apps.get_model("accounts", "User")
        Cohort = apps.get_model("cohorts", "Cohort")
        Enrollment = apps.get_model("cohorts", "Enrollment")
        Enrollment.objects.all().delete()
        Cohort.objects.all().delete()
        User.objects.all().delete()
        User.objects.create(
            email="phong@gmail.com",
            password=make_password("Existing@123"),
            role="ADMIN",
        )
        teacher = User.objects.create(
            email="legacy-teacher@example.test", password="pw", role="TEACHER"
        )
        student = User.objects.create(
            email="legacy-student@example.test", password="pw", role="STUDENT"
        )
        Cohort.objects.create(
            id=7,
            teacher=teacher,
            name="Legacy Class",
            description="Imported",
        )
        Enrollment.objects.create(id=9, cohort_id=7, student=student)

        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0002_seed_demo_data")])
        apps = executor.loader.project_state(
            [("accounts", "0002_seed_demo_data")]
        ).apps
        User = apps.get_model("accounts", "User")
        self.assertTrue(
            check_password(
                "Existing@123",
                User.objects.get(email="phong@gmail.com").password,
            )
        )
        self.assertEqual(User.objects.filter(role="TEACHER").count(), 3)
        self.assertEqual(User.objects.filter(role="STUDENT").count(), 5)

        executor = MigrationExecutor(connection)
        executor.migrate([("classes", "0001_initial")])
        apps = executor.loader.project_state([("classes", "0001_initial")]).apps
        Class = apps.get_model("classes", "Class")
        Enrollment = apps.get_model("classes", "Enrollment")

        self.assertEqual(Class.objects.get(id=7).name, "Legacy Class")
        self.assertEqual(Enrollment.objects.get(id=9).classroom_id, 7)
        self.assertEqual(Class.objects.count(), 3)
        self.assertEqual(Enrollment.objects.count(), 5)
