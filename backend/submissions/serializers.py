from pathlib import Path

from django.conf import settings
from rest_framework import serializers

from .models import Submission

# ponytail: magic-byte prefix check, not a full container parse (a corrupted
# zip with a valid PK header would still pass as "docx"). Upgrade to a real
# OOXML structure check only if that specific attack shows up in practice.
_SNIFFERS = {
    ".pdf": (b"%PDF-", "application/pdf"),
    ".docx": (b"PK\x03\x04", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
}


class SubmissionUploadSerializer(serializers.Serializer):
    file = serializers.FileField()

    def validate_file(self, upload):
        spec = _SNIFFERS.get(Path(upload.name).suffix.lower())
        if spec is None:
            raise serializers.ValidationError("Upload a PDF or DOCX file.")
        magic, content_type = spec
        header = upload.read(len(magic))
        upload.seek(0)
        if header != magic:
            raise serializers.ValidationError("Upload a PDF or DOCX file.")
        if upload.size > settings.MAX_UPLOAD_BYTES:
            raise serializers.ValidationError("File exceeds the upload size limit.")
        upload.content_type = content_type
        return upload


class SubmissionSerializer(serializers.ModelSerializer):
    graded = serializers.SerializerMethodField()
    student_name = serializers.CharField(source="student.full_name", read_only=True)

    class Meta:
        model = Submission
        fields = (
            "id",
            "assignment_id",
            "student_id",
            "student_name",
            "version",
            "original_filename",
            "content_type",
            "size",
            "created_at",
            "graded",
        )

    def get_graded(self, submission):
        return hasattr(submission, "grade")

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if self.context.get("omit_version"):
            data.pop("version", None)
        return data
