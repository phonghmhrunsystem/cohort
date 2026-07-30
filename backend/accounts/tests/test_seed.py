from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class FullNameBackfillMigrationTests(TransactionTestCase):
    reset_sequences = True

    def test_blank_teacher_and_student_names_are_backfilled_idempotently(self):
        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0003_user_profile")])
        apps = executor.loader.project_state(
            [("accounts", "0003_user_profile")]
        ).apps
        User = apps.get_model("accounts", "User")
        User.objects.create(
            email="le.thi.an@example.test",
            password="Password1!",
            role="STUDENT",
            full_name="",
        )
        User.objects.create(
            email="named.teacher@example.test",
            password="Password1!",
            role="TEACHER",
            full_name="Named Teacher",
        )
        User.objects.create(
            email="admin@example.test",
            password="Password1!",
            role="ADMIN",
            full_name="",
        )

        executor = MigrationExecutor(connection)
        targets = executor.loader.graph.leaf_nodes()
        executor.migrate(targets)
        apps = executor.loader.project_state(targets).apps
        User = apps.get_model("accounts", "User")

        self.assertEqual(
            User.objects.get(email="le.thi.an@example.test").full_name,
            "Le Thi An",
        )
        self.assertEqual(
            User.objects.get(email="named.teacher@example.test").full_name,
            "Named Teacher",
        )
        self.assertEqual(User.objects.get(email="admin@example.test").full_name, "")

        MigrationExecutor(connection).migrate(targets)
        self.assertEqual(
            User.objects.get(email="le.thi.an@example.test").full_name,
            "Le Thi An",
        )
