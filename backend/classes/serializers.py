from pathlib import Path

from django.conf import settings
from rest_framework import serializers
from django.utils import timezone

from accounts.models import User
from assignments.services import assignment_learning_state

from .models import Class, ClassResource, Enrollment


class TeacherDisplaySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "full_name", "email")


class ClassSerializer(serializers.ModelSerializer):
    teacher_id = serializers.PrimaryKeyRelatedField(
        source="teacher",
        queryset=User.objects.filter(
            role=User.Role.TEACHER, is_active=True, is_deleted=False
        ),
    )
    teacher = TeacherDisplaySerializer(read_only=True)
    student_count = serializers.IntegerField(read_only=True)
    assignment_count = serializers.SerializerMethodField()
    graded_count = serializers.SerializerMethodField()
    next_due_at = serializers.SerializerMethodField()

    class Meta:
        model = Class
        fields = (
            "id", "teacher_id", "teacher", "name", "description", "starts_at", "ends_at",
            "is_active", "student_count", "assignment_count", "graded_count", "next_due_at",
        )
        read_only_fields = ("is_active",)

    def validate_name(self, value):
        value = value.strip()
        if not 2 <= len(value) <= 100:
            raise serializers.ValidationError("Use 2 to 100 characters.")
        return value

    def validate_description(self, value):
        return value.strip()

    def validate_teacher_id(self, teacher):
        if teacher.role != User.Role.TEACHER or not teacher.is_active:
            raise serializers.ValidationError("Choose an active Teacher account.")
        return teacher

    def validate(self, attrs):
        starts_at = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends_at = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts_at and ends_at and starts_at >= ends_at:
            raise serializers.ValidationError({"ends_at": ["End time must be after start time."]})
        if (
            self.instance
            and "ends_at" in attrs
            and self.instance.assignments.filter(due_at__gt=ends_at).exists()
        ):
            raise serializers.ValidationError(
                {"ends_at": ["End time cannot precede an Assignment due date."]}
            )
        return attrs

    def _student_states(self, classroom):
        student = self.context.get("student")
        if not student:
            return None
        cache = self.__dict__.setdefault("_student_states_cache", {})
        if classroom.id not in cache:
            now = timezone.now()
            cache[classroom.id] = [
                (assignment, assignment_learning_state(assignment, student, now))
                for assignment in classroom.assignments.all()
            ]
        return cache[classroom.id]

    def get_assignment_count(self, classroom):
        states = self._student_states(classroom)
        return len(states) if states is not None else None

    def get_graded_count(self, classroom):
        states = self._student_states(classroom)
        return sum(state == "GRADED" for _, state in states) if states is not None else None

    def get_next_due_at(self, classroom):
        states = self._student_states(classroom)
        if states is None:
            return None
        nearest = min(
            (assignment.due_at for assignment, state in states if state in ("OPEN", "SUBMITTED")),
            default=None,
        )
        return nearest.isoformat() if nearest else None


class StudentProgressSerializer(serializers.ModelSerializer):
    submitted_assignments = serializers.IntegerField(read_only=True)
    graded_assignments = serializers.IntegerField(read_only=True)
    enrolled_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id", "full_name", "email", "phone", "hometown", "is_active",
            "enrolled_at", "submitted_assignments", "graded_assignments",
        )


class GradebookSerializer(serializers.Serializer):
    assignments = serializers.SerializerMethodField()
    students = serializers.SerializerMethodField()

    def get_assignments(self, gradebook):
        return [
            {"id": assignment.id, "title": assignment.title, "maximum_score": assignment.maximum_score}
            for assignment in gradebook["assignments"]
        ]

    def get_students(self, gradebook):
        now = self.context["now"]
        latest_submissions = self.context["latest_submissions"]
        assignments = gradebook["assignments"]
        return [
            {
                "id": student.id,
                "full_name": student.full_name,
                "email": student.email,
                "is_active": student.is_active,
                "grades": [
                    self._cell(assignment, student, now, latest_submissions)
                    for assignment in assignments
                ],
            }
            for student in gradebook["students"]
        ]

    def _cell(self, assignment, student, now, latest_submissions):
        submission = latest_submissions.get((assignment.id, student.id))
        grade = getattr(submission, "grade", None) if submission else None
        return {
            "assignment_id": assignment.id,
            "learning_state": assignment_learning_state(assignment, student, now, submission),
            "score": grade.total_score if grade else None,
        }


class StudentProfileSerializer(StudentProgressSerializer):
    """Student detail view: roster fields plus read-only profile data and the
    Classes shared with the requesting Teacher (context["teacher"])."""

    shared_classes = serializers.SerializerMethodField()

    class Meta(StudentProgressSerializer.Meta):
        fields = StudentProgressSerializer.Meta.fields + (
            "date_of_birth", "gender", "address", "shared_classes",
        )

    def get_shared_classes(self, student):
        teacher = self.context["teacher"]
        classes = Class.objects.filter(teacher=teacher, enrollments__student=student).distinct()
        return ClassSerializer(classes, many=True).data


class EnrollmentSerializer(serializers.ModelSerializer):
    class_id = serializers.IntegerField(source="classroom_id", read_only=True)
    student_id = serializers.PrimaryKeyRelatedField(
        source="student",
        queryset=User.objects.filter(
            role=User.Role.STUDENT, is_active=True, is_deleted=False
        ),
    )

    class Meta:
        model = Enrollment
        fields = ("id", "class_id", "student_id")

    def validate_student_id(self, student):
        if student.role != User.Role.STUDENT or not student.is_active:
            raise serializers.ValidationError("Only active Student accounts can be enrolled.")
        return student


class EnrollmentSetSerializer(serializers.Serializer):
    student_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=True)

    def validate_student_ids(self, ids):
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Student IDs must be unique.")
        students = list(User.objects.filter(id__in=ids, is_deleted=False))
        if len(students) != len(ids) or any(
            student.role != User.Role.STUDENT or not student.is_active for student in students
        ):
            raise serializers.ValidationError("Only active Student accounts can be enrolled.")
        return students


# Extension whitelist for an uploaded resource, with the magic prefix the file
# must start with and the content type the server assigns. `.txt` has no
# signature, so it is accepted on the extension alone.
# ponytail: magic-byte prefix check, not a container parse — same trade-off as
# submissions/serializers.py.
UPLOAD_TYPES = {
    ".pdf": (b"%PDF-", "application/pdf"),
    ".doc": (b"\xd0\xcf\x11\xe0", "application/msword"),
    ".docx": (b"PK\x03\x04", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ".ppt": (b"\xd0\xcf\x11\xe0", "application/vnd.ms-powerpoint"),
    ".pptx": (b"PK\x03\x04", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    ".xls": (b"\xd0\xcf\x11\xe0", "application/vnd.ms-excel"),
    ".xlsx": (b"PK\x03\x04", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ".txt": (None, "text/plain"),
    ".zip": (b"PK\x03\x04", "application/zip"),
}
UPLOAD_MESSAGE = "Upload a PDF, Word, PowerPoint, Excel, text or zip file."


class ClassResourceSerializer(serializers.ModelSerializer):
    """One row is a link or a file (07 §1.1). `file` is write-only: the view
    stores the bytes, the client reads them back through the download route."""

    kind = serializers.CharField(read_only=True)
    url = serializers.CharField(required=False, allow_blank=True, max_length=2048)
    file = serializers.FileField(required=False, write_only=True)

    class Meta:
        model = ClassResource
        fields = ("id", "title", "description", "url", "file", "kind", "original_filename", "content_type", "size")
        read_only_fields = ("original_filename", "content_type", "size")

    def validate_title(self, value):
        value = value.strip()
        if not 2 <= len(value) <= 150: raise serializers.ValidationError("Use 2 to 150 characters.")
        return value

    def validate_description(self, value): return value.strip()

    def validate_url(self, value):
        value = value.strip()
        if value and not value.startswith("https://"): raise serializers.ValidationError("Use an absolute https URL.")
        return value

    def validate_file(self, upload):
        spec = UPLOAD_TYPES.get(Path(upload.name).suffix.lower())
        if spec is None: raise serializers.ValidationError(UPLOAD_MESSAGE)
        magic, content_type = spec
        if magic is not None:
            header = upload.read(len(magic))
            upload.seek(0)
            if header != magic: raise serializers.ValidationError(UPLOAD_MESSAGE)
        if upload.size > settings.MAX_UPLOAD_BYTES: raise serializers.ValidationError("File exceeds the upload size limit.")
        # The browser-sent type is attacker-controlled; derive it from the extension.
        upload.content_type = content_type
        return upload

    def validate(self, attrs):
        url, upload = attrs.get("url", ""), attrs.get("file")
        if url and upload:
            raise serializers.ValidationError("Provide either a link or a file, not both.")
        if not url and not upload:
            # On PATCH an untouched resource keeps whatever side it already has,
            # but blanking the link of a link resource would leave it with no
            # source at all — the DB constraint would reject it as a 500.
            if not self.instance or ("url" in attrs and not self.instance.file_path):
                raise serializers.ValidationError("Provide a link or a file.")
        return attrs
