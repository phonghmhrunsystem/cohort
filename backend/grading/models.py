from django.conf import settings
from django.db import models

from assignments.models import Assignment, RubricCriterion
from submissions.models import Submission


class Grade(models.Model):
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="grading_grades")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="grading_grades")
    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="grades_given")
    submission = models.OneToOneField(Submission, on_delete=models.PROTECT, related_name="grade")
    total_score = models.PositiveSmallIntegerField()
    feedback = models.TextField(max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("assignment", "student"), name="unique_grading_grade"),
        ]


class CriterionScore(models.Model):
    grade = models.ForeignKey(Grade, on_delete=models.CASCADE, related_name="scores")
    criterion = models.ForeignKey(RubricCriterion, on_delete=models.PROTECT, related_name="scores")
    score = models.PositiveSmallIntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("grade", "criterion"), name="unique_criterion_score"),
        ]
