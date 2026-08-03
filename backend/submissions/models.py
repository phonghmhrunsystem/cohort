from django.conf import settings
from django.db import models

from assignments.models import Assignment


class Submission(models.Model):
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="submissions")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="submissions")
    version = models.PositiveIntegerField()
    file_path = models.CharField(max_length=255)
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("assignment", "student", "version"),
                name="unique_submission_version",
            )
        ]
        ordering = ("-version",)
