from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from accounts.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from submissions.models import Submission

from .models import Grade
from .serializers import GradeSerializer
from .services import GradingRejected, grade_submission


class SubmissionGradeView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, submission_id):
        if request.user.role != User.Role.TEACHER:
            return Response(status=status.HTTP_403_FORBIDDEN)
        submission = get_object_or_404(
            Submission, id=submission_id, assignment__classroom__teacher=request.user
        )
        try:
            grade = grade_submission(teacher=request.user, submission=submission, payload=request.data)
        except GradingRejected as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        return Response(GradeSerializer(grade).data, status=status.HTTP_200_OK)


class AssignmentStudentResultView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, assignment_id, student_id):
        if request.user.role != User.Role.TEACHER:
            return Response(status=status.HTTP_403_FORBIDDEN)
        grade = get_object_or_404(
            Grade.objects.prefetch_related("scores__criterion"),
            assignment_id=assignment_id,
            student_id=student_id,
            assignment__classroom__teacher=request.user,
        )
        return Response(GradeSerializer(grade).data)


class AssignmentMyResultView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, assignment_id):
        if request.user.role != User.Role.STUDENT:
            return Response(status=status.HTTP_403_FORBIDDEN)
        grade = get_object_or_404(
            Grade.objects.prefetch_related("scores"),
            assignment_id=assignment_id,
            student=request.user,
        )
        return Response(GradeSerializer(grade).data)
