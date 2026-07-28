from rest_framework import serializers

from accounts.models import User

from .models import Class, Enrollment


class ClassSerializer(serializers.ModelSerializer):
    teacher_id = serializers.PrimaryKeyRelatedField(source="teacher", queryset=User.objects.all())

    class Meta:
        model = Class
        fields = ("id", "teacher_id", "name", "description", "starts_at", "ends_at")

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


class StudentProgressSerializer(serializers.ModelSerializer):
    submitted_assignments = serializers.IntegerField(read_only=True)
    graded_assignments = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = ("id", "full_name", "email", "submitted_assignments", "graded_assignments")


class EnrollmentSerializer(serializers.ModelSerializer):
    class_id = serializers.IntegerField(source="classroom_id", read_only=True)
    student_id = serializers.PrimaryKeyRelatedField(source="student", queryset=User.objects.all())

    class Meta:
        model = Enrollment
        fields = ("id", "class_id", "student_id")

    def validate_student_id(self, student):
        if student.role != User.Role.STUDENT or not student.is_active:
            raise serializers.ValidationError("Only active Student accounts can be enrolled.")
        return student
