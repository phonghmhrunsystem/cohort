from django.conf import settings
from django.db import models


class AuditLogQuerySet(models.QuerySet):
    def bulk_create(
        self,
        objs,
        batch_size=None,
        ignore_conflicts=False,
        update_conflicts=False,
        update_fields=None,
        unique_fields=None,
    ):
        if update_conflicts:
            raise RuntimeError("Audit logs are append-only.")
        return super().bulk_create(
            objs,
            batch_size=batch_size,
            ignore_conflicts=ignore_conflicts,
            update_conflicts=update_conflicts,
            update_fields=update_fields,
            unique_fields=unique_fields,
        )

    def update(self, **kwargs):
        raise RuntimeError("Audit logs are append-only.")

    def delete(self):
        raise RuntimeError("Audit logs are append-only.")


class AuditLog(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    action = models.CharField(max_length=100)
    target_type = models.CharField(max_length=100)
    target_id = models.PositiveBigIntegerField()
    metadata = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = AuditLogQuerySet.as_manager()

    class Meta:
        ordering = ("-created_at", "-id")

    def save(self, *args, **kwargs):
        if self.pk:
            raise RuntimeError("Audit logs are append-only.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("Audit logs are append-only.")
