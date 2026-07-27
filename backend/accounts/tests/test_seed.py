from django.contrib.auth.hashers import check_password, make_password
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class DemoSeedMigrationTests(TransactionTestCase):
    reset_sequences = True

    def migrate_to_pre_seed_state(self):
        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0001_initial"), ("classes", "0001_initial")])
        apps = executor.loader.project_state(
            [("accounts", "0001_initial"), ("classes", "0001_initial")]
        ).apps
        apps.get_model("classes", "Enrollment").objects.all().delete()
        apps.get_model("classes", "Class").objects.all().delete()
        apps.get_model("accounts", "User").objects.all().delete()

    def test_seed_migration_creates_loginable_demo_data(self):
        self.migrate_to_pre_seed_state()
        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0002_seed_demo_data")])

        apps = executor.loader.project_state([("accounts", "0002_seed_demo_data")]).apps
        User = apps.get_model("accounts", "User")
        Class = apps.get_model("classes", "Class")
        Enrollment = apps.get_model("classes", "Enrollment")
        admin = User.objects.get(email="phong@gmail.com")

        self.assertTrue(check_password("Admin@123", admin.password))
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)
        self.assertEqual(User.objects.filter(role="TEACHER").count(), 2)
        self.assertEqual(User.objects.filter(role="STUDENT").count(), 4)
        self.assertEqual(Class.objects.count(), 2)
        self.assertEqual(Enrollment.objects.count(), 4)

    def test_seed_migration_keeps_an_existing_admin_unchanged(self):
        self.migrate_to_pre_seed_state()
        executor = MigrationExecutor(connection)
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

    def test_class_migration_moves_legacy_cohort_rows(self):
        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0001_initial"), ("classes", None)])
        apps = executor.loader.project_state([("accounts", "0001_initial")]).apps
        User = apps.get_model("accounts", "User")
        teacher = User.objects.create(email="legacy-teacher@example.test", password="pw", role="TEACHER")
        student = User.objects.create(email="legacy-student@example.test", password="pw", role="STUDENT")
        with connection.cursor() as cursor:
            cursor.execute("DROP TABLE IF EXISTS classes_enrollment")
            cursor.execute("DROP TABLE IF EXISTS classes_class")
            cursor.execute("DELETE FROM django_migrations WHERE app = 'classes'")
            cursor.execute("CREATE TABLE cohorts_cohort (id integer primary key, name varchar(255) not null, description text not null, teacher_id bigint not null)")
            cursor.execute("CREATE TABLE cohorts_enrollment (id integer primary key, cohort_id bigint not null, student_id bigint not null)")
            cursor.execute("INSERT INTO cohorts_cohort (id, name, description, teacher_id) VALUES (7, 'Legacy Class', 'Imported', %s)", [teacher.id])
            cursor.execute("INSERT INTO cohorts_enrollment (id, cohort_id, student_id) VALUES (9, 7, %s)", [student.id])

        executor = MigrationExecutor(connection)
        executor.migrate([("classes", "0001_initial")])
        apps = executor.loader.project_state([("classes", "0001_initial")]).apps
        Class = apps.get_model("classes", "Class")
        Enrollment = apps.get_model("classes", "Enrollment")

        self.assertEqual(Class.objects.get(id=7).name, "Legacy Class")
        self.assertEqual(Enrollment.objects.get(id=9).classroom_id, 7)
