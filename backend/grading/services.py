from django.db import transaction
from django.http import Http404

from assignments.models import AssignmentGrade
from audit.services import write_audit
from submissions.models import Submission

from .models import CriterionScore, Grade
from .serializers import GradeInputSerializer

NOT_LATEST_MESSAGE = "Only the latest submission version can be graded."
ALREADY_GRADED_MESSAGE = "This Assignment has already been graded."


class GradingRejected(Exception):
    pass


def grade_submission(*, teacher, submission, payload):
    with transaction.atomic():
        owned = (
            Submission.objects.select_related("assignment", "student")
            .filter(id=submission.id, assignment__classroom__teacher=teacher)
            .first()
        )
        if owned is None:
            raise Http404
        assignment = owned.assignment
        student = owned.student

        latest_version = (
            Submission.objects.filter(assignment=assignment, student=student)
            .order_by("-version")
            .values_list("version", flat=True)
            .first()
        )
        if owned.version != latest_version:
            raise GradingRejected(NOT_LATEST_MESSAGE)
        if Grade.objects.filter(assignment=assignment, student=student).exists():
            raise GradingRejected(ALREADY_GRADED_MESSAGE)

        serializer = GradeInputSerializer(data=payload, context={"assignment": assignment})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        grade = Grade.objects.create(
            assignment=assignment,
            student=student,
            teacher=teacher,
            submission=owned,
            total_score=data["total_score"],
            feedback=data["feedback"],
        )
        if data.get("scores"):
            CriterionScore.objects.bulk_create(
                [
                    CriterionScore(grade=grade, criterion_id=item["criterion_id"], score=item["score"])
                    for item in data["scores"]
                ]
            )
        # Reuses the existing lock table submissions.services already checks against.
        AssignmentGrade.objects.create(assignment=assignment, student=student, score=data["total_score"])
        write_audit(
            actor=teacher,
            action="grade.created",
            target=grade,
            metadata={
                "assignment_id": assignment.id,
                "student_id": student.id,
                "submission_id": owned.id,
                "total_score": data["total_score"],
            },
        )
    return grade
