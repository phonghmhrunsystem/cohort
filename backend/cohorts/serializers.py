from rest_framework import serializers

from accounts.models import User

from .models import Cohort, Enrollment


class CohortSerializer(serializers.ModelSerializer):
    teacher_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Cohort
        fields = ("id", "teacher_id", "name", "description")


class EnrollmentSerializer(serializers.ModelSerializer):
    cohort_id = serializers.IntegerField(read_only=True)
    student_id = serializers.PrimaryKeyRelatedField(source="student", queryset=User.objects.all())

    class Meta:
        model = Enrollment
        fields = ("id", "cohort_id", "student_id")

    def validate_student_id(self, student):
        if student.role != User.Role.STUDENT:
            raise serializers.ValidationError("Only Student accounts can be enrolled.")
        return student
