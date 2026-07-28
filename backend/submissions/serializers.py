from pathlib import Path

from django.conf import settings
from rest_framework import serializers

from .models import Submission


class SubmissionUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    note = serializers.CharField(required=False, allow_blank=True, max_length=1000)

    def validate_file(self, upload):
        allowed_types = {
            ".pdf": "application/pdf",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }
        if allowed_types.get(Path(upload.name).suffix.lower()) != upload.content_type:
            raise serializers.ValidationError("Upload a PDF or DOCX file.")
        if upload.size > settings.MAX_UPLOAD_BYTES:
            raise serializers.ValidationError("File exceeds the upload size limit.")
        return upload


class SubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Submission
        fields = (
            "id",
            "assignment_id",
            "student_id",
            "version",
            "original_filename",
            "content_type",
            "size",
            "note",
            "created_at",
        )
