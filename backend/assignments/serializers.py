from django.utils import timezone
from rest_framework import serializers

from .models import Assignment, RubricCriterion
from .services import assignment_learning_state, closure_reason, deadline_badge


class RubricCriterionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RubricCriterion
        fields = ("id", "title", "maximum_score")
        read_only_fields = ("id",)

    def validate_title(self, value):
        value = value.strip()
        if not 2 <= len(value) <= 150:
            raise serializers.ValidationError("Use 2 to 150 characters.")
        return value

    def validate_maximum_score(self, value):
        if not 1 <= value <= 100:
            raise serializers.ValidationError("Use an integer from 1 to 100.")
        return value


class AssignmentSerializer(serializers.ModelSerializer):
    criteria = RubricCriterionSerializer(many=True, read_only=True)
    maximum_score = serializers.IntegerField(read_only=True)
    learning_state = serializers.SerializerMethodField()
    deadline_badge = serializers.SerializerMethodField()
    closure_reason = serializers.SerializerMethodField()
    submitted_count = serializers.SerializerMethodField()
    graded_count = serializers.SerializerMethodField()
    enrolled_count = serializers.SerializerMethodField()
    score = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = (
            "id", "classroom_id", "title", "description", "due_at", "maximum_score",
            "criteria", "created_at", "learning_state", "deadline_badge", "closure_reason",
            "submitted_count", "graded_count", "enrolled_count", "score",
        )
        read_only_fields = ("id", "classroom_id", "maximum_score", "criteria", "created_at")

    def validate_title(self, value):
        value = value.strip()
        if not 2 <= len(value) <= 150:
            raise serializers.ValidationError("Use 2 to 150 characters.")
        return value

    def validate_description(self, value):
        value = value.strip()
        if not 10 <= len(value) <= 5000:
            raise serializers.ValidationError("Use 10 to 5,000 characters.")
        return value

    def validate(self, attrs):
        if "maximum_score" in self.initial_data:
            raise serializers.ValidationError({"maximum_score": ["Maximum score is fixed at 100."]})
        due_at = attrs.get("due_at", getattr(self.instance, "due_at", None))
        classroom = self.context["classroom"]
        if due_at <= timezone.now():
            raise serializers.ValidationError({"due_at": ["Due date must be in the future."]})
        if not classroom.starts_at <= due_at <= classroom.ends_at:
            raise serializers.ValidationError({"due_at": ["Due date must be within the Class period."]})
        return attrs

    def get_learning_state(self, assignment):
        student = self.context.get("student")
        if not student:
            return None
        return assignment_learning_state(assignment, student, timezone.now())

    def get_deadline_badge(self, assignment):
        if not self.context.get("student"):
            return None
        return deadline_badge(assignment.due_at, timezone.now())

    def get_closure_reason(self, assignment):
        student = self.context.get("student")
        if not student:
            return None
        now = timezone.now()
        return closure_reason(assignment, now) if assignment_learning_state(assignment, student, now) == "CLOSED" else None

    def get_submitted_count(self, assignment):
        counts = self.context.get("counts")
        return counts[assignment.id]["submitted"] if counts else None

    def get_graded_count(self, assignment):
        counts = self.context.get("counts")
        return counts[assignment.id]["graded"] if counts else None

    def get_score(self, assignment):
        student = self.context.get("student")
        if not student:
            return None
        scores = self.context.get("scores")
        if scores is not None:
            score = scores.get(assignment.id)
        else:
            from .models import AssignmentGrade

            grade = AssignmentGrade.objects.filter(assignment=assignment, student=student).first()
            score = grade.score if grade else None
        if score is not None:
            return score
        now = timezone.now()
        if assignment_learning_state(assignment, student, now) in ("SUBMITTED", "GRADED"):
            return None
        return 0 if now >= assignment.due_at else None

    def get_enrolled_count(self, assignment):
        return self.context.get("enrolled_count")


class RubricSerializer(serializers.Serializer):
    criteria = RubricCriterionSerializer(many=True)

    def validate_criteria(self, criteria):
        if not criteria:
            raise serializers.ValidationError("Provide at least one rubric criterion.")
        if sum(criterion["maximum_score"] for criterion in criteria) != 100:
            raise serializers.ValidationError("Criteria must total exactly 100 points.")
        return criteria
