from django.conf import settings
from django.db import models


class Class(models.Model):
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="classes"
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, max_length=1000)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    is_active = models.BooleanField(default=True)


class Enrollment(models.Model):
    classroom = models.ForeignKey(Class, on_delete=models.CASCADE, related_name="enrollments")
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="enrollments"
    )

    class Meta:
        constraints = [models.UniqueConstraint(fields=("classroom", "student"), name="unique_class_enrollment")]


class ClassResource(models.Model):
    classroom = models.ForeignKey(Class, on_delete=models.CASCADE, related_name="resources")
    title = models.CharField(max_length=150)
    description = models.TextField(blank=True, max_length=1000)
    url = models.URLField(max_length=2048)
