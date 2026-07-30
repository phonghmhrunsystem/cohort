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
    progress = serializers.SerializerMethodField()
    student_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Class
        fields = ("id", "teacher_id", "teacher", "name", "description", "starts_at", "ends_at", "progress", "is_active", "student_count")
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
        if self.instance and "teacher" in attrs:
            raise serializers.ValidationError({"teacher_id": ["Teacher assignment cannot be changed."]})
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

    def get_progress(self, classroom):
        student = self.context.get("student")
        if not student:
            return None
        from assignments.services import assignment_learning_state

        now = timezone.now()
        states = [
            (assignment, assignment_learning_state(assignment, student, now))
            for assignment in classroom.assignments.all()
        ]
        nearest = min(
            (assignment.due_at for assignment, state in states if state in ("OPEN", "SUBMITTED")),
            default=None,
        )
        return {
            "graded_assignments": sum(state == "GRADED" for _, state in states),
            "total_assignments": len(states),
            "nearest_deadline": nearest.isoformat() if nearest else None,
        }


class StudentProgressSerializer(serializers.ModelSerializer):
    submitted_assignments = serializers.IntegerField(read_only=True)
    graded_assignments = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = ("id", "full_name", "email", "submitted_assignments", "graded_assignments")


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
                "grades": [
                    {
                        "assignment_id": assignment.id,
                        "learning_state": assignment_learning_state(
                            assignment,
                            student,
                            now,
                            latest_submissions.get((assignment.id, student.id)),
                        ),
                        "score": getattr(latest_submissions.get((assignment.id, student.id)), "grade", None).total_score
                        if hasattr(latest_submissions.get((assignment.id, student.id)), "grade") else None,
                    }
                    for assignment in assignments
                ],
            }
            for student in gradebook["students"]
        ]


class StudentProfileSerializer(StudentProgressSerializer):
    """Student detail view: roster fields plus read-only profile data and the
    Classes shared with the requesting Teacher (context["teacher"])."""

    shared_classes = serializers.SerializerMethodField()

    class Meta(StudentProgressSerializer.Meta):
        fields = StudentProgressSerializer.Meta.fields + (
            "phone", "date_of_birth", "gender", "address", "shared_classes",
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


class ClassResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClassResource
        fields = ("id", "title", "description", "url")

    def validate_title(self, value):
        value = value.strip()
        if not 2 <= len(value) <= 150: raise serializers.ValidationError("Use 2 to 150 characters.")
        return value

    def validate_description(self, value): return value.strip()

    def validate_url(self, value):
        if not value.startswith("https://"): raise serializers.ValidationError("Use an absolute https URL.")
        return value
