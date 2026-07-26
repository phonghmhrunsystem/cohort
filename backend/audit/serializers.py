from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = AuditLog
        fields = ("id", "actor_id", "action", "target_type", "target_id", "metadata", "created_at")
