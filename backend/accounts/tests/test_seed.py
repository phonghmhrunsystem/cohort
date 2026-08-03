from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.core.management import call_command
from django.test import TransactionTestCase
from django.test import TestCase
from django.utils import timezone

from assignments.models import AssignmentGrade
from grading.models import Grade
from submissions.models import Submission


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


class DemoSeedTests(TestCase):
    def test_every_seeded_grade_has_the_submission_lock_row(self):
        call_command("seed_demo")

        demo_grades = Grade.objects.filter(assignment__classroom__name__startswith="Lop Demo")
        demo_locks = AssignmentGrade.objects.filter(assignment__classroom__name__startswith="Lop Demo")

        self.assertEqual(demo_locks.count(), demo_grades.count())
        self.assertFalse(
            Submission.objects.filter(
                assignment__classroom__name__startswith="Lop Demo",
                assignment__classroom__is_active=False,
            ).exists()
        )
        self.assertFalse(
            Submission.objects.filter(
                assignment__classroom__name__startswith="Lop Demo",
                assignment__classroom__starts_at__gt=timezone.now(),
            ).exists()
        )
