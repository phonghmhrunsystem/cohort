from django.conf import settings
from django.db import models

from classes.models import Class


class Assignment(models.Model):
    classroom = models.ForeignKey(Class, on_delete=models.CASCADE, related_name="assignments")
    title = models.CharField(max_length=150)
    description = models.TextField(max_length=5000)
    due_at = models.DateTimeField()
    maximum_score = models.PositiveSmallIntegerField(default=100, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-id")


class RubricCriterion(models.Model):
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="criteria")
    title = models.CharField(max_length=150)
    maximum_score = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ("id",)


class AssignmentGrade(models.Model):
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="grades")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="assignment_grades")
    score = models.PositiveSmallIntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("assignment", "student"), name="unique_assignment_grade"
            )
        ]
