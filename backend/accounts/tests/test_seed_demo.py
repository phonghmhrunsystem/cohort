import tempfile
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase, override_settings

from accounts.models import User
from accounts.seed_data import build_roster, email_local_part
from assignments.models import Assignment, RubricCriterion
from classes.models import Class, ClassResource, Enrollment
from grading.models import Grade
from notifications.models import Notification
from submissions.models import Submission

FAST_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


class EmailFormatTests(TestCase):
    def test_local_part_is_given_name_then_leading_initials(self):
        self.assertEqual(email_local_part("Nguyễn Văn An"), "annv")
        self.assertEqual(email_local_part("Trần Thị Minh Anh"), "anhttm")
        self.assertEqual(email_local_part("Vũ Văn Anh Khoa"), "khoavva")

    def test_d_with_stroke_becomes_d(self):
        self.assertEqual(email_local_part("Phan Văn Đức"), "ducpv")
        self.assertEqual(email_local_part("Đặng Thị Yến"), "yendt")

    def test_roster_has_the_expected_shape_and_unique_emails(self):
        roster = build_roster()
        roles = [entry["role"] for entry in roster]
        self.assertEqual(roles.count("ADMIN"), 1)
        self.assertEqual(roles.count("TEACHER"), 10)
        self.assertEqual(roles.count("STUDENT"), 80)
        emails = [entry["email"] for entry in roster]
        self.assertEqual(len(set(emails)), len(emails))


@override_settings(PASSWORD_HASHERS=FAST_HASHERS)
class SeedDemoCommandTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.media_root = tempfile.mkdtemp()
        with override_settings(MEDIA_ROOT=cls.media_root, PASSWORD_HASHERS=FAST_HASHERS):
            call_command("seed_demo", verbosity=0)

    def test_roster_volumes(self):
        self.assertEqual(User.objects.filter(role=User.Role.TEACHER).count(), 10)
        self.assertEqual(User.objects.filter(role=User.Role.STUDENT).count(), 80)
        self.assertTrue(User.objects.filter(email="annv@eduplatform.local").exists())

    def test_twelve_classes_each_with_fifteen_students(self):
        self.assertEqual(Class.objects.count(), 12)
        for classroom in Class.objects.all():
            self.assertEqual(
                Enrollment.objects.filter(classroom=classroom).count(), 15, classroom.name
            )

    def test_four_assignments_per_class_each_with_a_full_rubric(self):
        for classroom in Class.objects.all():
            assignments = Assignment.objects.filter(classroom=classroom)
            self.assertEqual(assignments.count(), 4, classroom.name)
            for assignment in assignments:
                criteria = RubricCriterion.objects.filter(assignment=assignment)
                self.assertEqual(criteria.count(), 4)
                self.assertEqual(
                    sum(criterion.maximum_score for criterion in criteria),
                    assignment.maximum_score,
                )

    def test_five_resources_per_class_split_into_links_and_files(self):
        for classroom in Class.objects.all():
            resources = list(ClassResource.objects.filter(classroom=classroom))
            self.assertEqual(len(resources), 5, classroom.name)
            kinds = [resource.kind for resource in resources]
            self.assertEqual(kinds.count("link"), 3)
            self.assertEqual(kinds.count("file"), 2)

    def test_file_resources_point_at_bytes_that_exist(self):
        for resource in ClassResource.objects.exclude(file_path=""):
            stored = Path(self.media_root) / resource.file_path
            self.assertTrue(stored.exists(), resource.file_path)
            self.assertEqual(stored.stat().st_size, resource.size)

    def test_submissions_and_grades_exist_without_covering_everyone(self):
        submissions = Submission.objects.count()
        grades = Grade.objects.count()
        self.assertGreater(submissions, 0)
        self.assertLess(submissions, Assignment.objects.count() * 15)
        self.assertGreater(grades, 0)
        self.assertLessEqual(grades, submissions)
        self.assertTrue(Notification.objects.exists())

    def test_no_submission_belongs_to_a_class_that_has_not_started(self):
        for submission in Submission.objects.select_related("assignment__classroom"):
            classroom = submission.assignment.classroom
            self.assertLess(classroom.starts_at, submission.created_at)

    def test_grade_total_matches_its_criterion_scores(self):
        for grade in Grade.objects.prefetch_related("scores"):
            self.assertEqual(grade.total_score, sum(score.score for score in grade.scores.all()))

    def test_rerunning_the_command_changes_nothing(self):
        before = (
            User.objects.count(), Class.objects.count(), Enrollment.objects.count(),
            Assignment.objects.count(), ClassResource.objects.count(),
            Submission.objects.count(), Grade.objects.count(), Notification.objects.count(),
        )
        with override_settings(MEDIA_ROOT=self.media_root, PASSWORD_HASHERS=FAST_HASHERS):
            call_command("seed_demo", verbosity=0)
        after = (
            User.objects.count(), Class.objects.count(), Enrollment.objects.count(),
            Assignment.objects.count(), ClassResource.objects.count(),
            Submission.objects.count(), Grade.objects.count(), Notification.objects.count(),
        )
        self.assertEqual(before, after)
