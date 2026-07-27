from django.db import models

from classes.models import Class


class Assignment(models.Model):
    classroom = models.ForeignKey(Class, on_delete=models.CASCADE, related_name="assignments")
    title = models.CharField(max_length=150)
    description = models.TextField(max_length=5000)
    due_at = models.DateTimeField()
    maximum_score = models.PositiveSmallIntegerField(default=100, editable=False)

    class Meta:
        ordering = ("id",)


class RubricCriterion(models.Model):
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="criteria")
    title = models.CharField(max_length=150)
    maximum_score = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ("id",)
