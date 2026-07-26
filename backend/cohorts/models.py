from django.conf import settings
from django.db import models


class Cohort(models.Model):
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="cohorts"
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)


class Enrollment(models.Model):
    cohort = models.ForeignKey(Cohort, on_delete=models.CASCADE, related_name="enrollment")
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="enrollments"
    )

    class Meta:
        constraints = [models.UniqueConstraint(fields=("cohort", "student"), name="unique_enrollment")]
