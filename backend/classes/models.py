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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Enrollment(models.Model):
    classroom = models.ForeignKey(Class, on_delete=models.CASCADE, related_name="enrollments")
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="enrollments"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("classroom", "student"), name="unique_class_enrollment")]


class ClassResource(models.Model):
    classroom = models.ForeignKey(Class, on_delete=models.CASCADE, related_name="resources")
    title = models.CharField(max_length=150)
    description = models.TextField(blank=True, max_length=1000)
    url = models.URLField(max_length=2048, blank=True, default="")
    file_path = models.CharField(max_length=255, blank=True, default="")
    original_filename = models.CharField(max_length=255, blank=True, default="")
    content_type = models.CharField(max_length=100, blank=True, default="")
    size = models.PositiveBigIntegerField(null=True, blank=True)

    class Meta:
        constraints = [
            # A resource is a link or a file, never both and never neither. The
            # constraint lives in the DB so a code path that forgets to validate
            # cannot write a row nothing can render.
            models.CheckConstraint(
                check=(
                    models.Q(url="", file_path__gt="") | models.Q(url__gt="", file_path="")
                ),
                name="class_resource_link_xor_file",
            )
        ]

    @property
    def kind(self):
        """Derived, never stored: a stored kind is a second source of truth."""
        return "file" if self.file_path else "link"
