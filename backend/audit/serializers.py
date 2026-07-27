from rest_framework import serializers

from .services import safe_metadata
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_id = serializers.IntegerField(read_only=True)
    actor = serializers.SerializerMethodField()
    metadata = serializers.SerializerMethodField()

    def get_actor(self, log):
        return {"id": log.actor_id, "full_name": log.actor.full_name, "email": log.actor.email}

    def get_metadata(self, log):
        return safe_metadata(log.metadata)

    class Meta:
        model = AuditLog
        fields = ("id", "actor_id", "actor", "action", "target_type", "target_id", "metadata", "created_at")
