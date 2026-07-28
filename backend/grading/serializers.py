from rest_framework import serializers

from .models import CriterionScore, Grade


class CriterionScoreInputSerializer(serializers.Serializer):
    criterion_id = serializers.IntegerField()
    score = serializers.IntegerField(min_value=0)


class GradeInputSerializer(serializers.Serializer):
    feedback = serializers.CharField()
    scores = CriterionScoreInputSerializer(many=True, required=False)
    total_score = serializers.IntegerField(required=False)

    def validate_feedback(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Feedback is required.")
        return value

    def validate(self, attrs):
        assignment = self.context["assignment"]
        criteria = {criterion.id: criterion for criterion in assignment.criteria.all()}
        if criteria:
            scores = attrs.get("scores")
            if not scores:
                raise serializers.ValidationError(
                    {"scores": ["Provide a score for each rubric criterion."]}
                )
            ids = [item["criterion_id"] for item in scores]
            if len(ids) != len(set(ids)) or set(ids) != set(criteria):
                raise serializers.ValidationError(
                    {"scores": ["Provide exactly one score for each rubric criterion."]}
                )
            for item in scores:
                criterion = criteria[item["criterion_id"]]
                if not 0 <= item["score"] <= criterion.maximum_score:
                    raise serializers.ValidationError(
                        {"scores": [f"Score for '{criterion.title}' must be 0 to {criterion.maximum_score}."]}
                    )
            attrs["total_score"] = sum(item["score"] for item in scores)
        else:
            if "scores" in self.initial_data:
                raise serializers.ValidationError(
                    {"scores": ["This Assignment has no rubric; submit total_score instead."]}
                )
            total_score = attrs.get("total_score")
            if total_score is None or not 0 <= total_score <= 100:
                raise serializers.ValidationError({"total_score": ["Use an integer from 0 to 100."]})
        return attrs


class CriterionScoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = CriterionScore
        fields = ("criterion_id", "score")


class GradeSerializer(serializers.ModelSerializer):
    scores = CriterionScoreSerializer(many=True, read_only=True)

    class Meta:
        model = Grade
        fields = (
            "id",
            "assignment_id",
            "student_id",
            "submission_id",
            "total_score",
            "feedback",
            "scores",
            "created_at",
        )
