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


class TeacherSubmissionRowSerializer(serializers.Serializer):
    """One row per currently-enrolled student — spec 04-submissions.md §3.1.
    `submission` is None for a student who hasn't submitted; the row never
    carries `version`, matching the teacher's "one file, no history" view."""

    student_id = serializers.IntegerField()
    student_name = serializers.CharField(allow_null=True)
    is_active = serializers.BooleanField()
    submission = serializers.SerializerMethodField()
    graded = serializers.SerializerMethodField()
    score = serializers.SerializerMethodField()

    def get_submission(self, row):
        submission = row["submission"]
        if submission is None:
            return None
        return {
            "id": submission.id,
            "original_filename": submission.original_filename,
            "content_type": submission.content_type,
            "size": submission.size,
            "created_at": submission.created_at,
        }

    def get_graded(self, row):
        return row["submission"] is not None and hasattr(row["submission"], "grade")

    def get_score(self, row):
        submission = row["submission"]
        if submission is not None and hasattr(submission, "grade"):
            return submission.grade.total_score
        return None
