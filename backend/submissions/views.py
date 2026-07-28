from django.core.files.storage import default_storage
from django.db.models import OuterRef, Subquery
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from assignments.models import Assignment
from classes.views import scoped_classes

from .models import Submission
from .serializers import SubmissionSerializer, SubmissionUploadSerializer
from .services import create_submission


def scoped_assignment(user, assignment_id):
    return get_object_or_404(
        Assignment.objects.select_related("classroom").filter(
            classroom__in=scoped_classes(user)
        ),
        id=assignment_id,
    )


def can_submit(assignment):
    now = timezone.now()
    return assignment.classroom.starts_at <= now < assignment.classroom.ends_at and now < assignment.due_at


class AssignmentSubmissionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, assignment_id):
        assignment = scoped_assignment(request.user, assignment_id)
        if request.user.role == User.Role.TEACHER:
            latest = Submission.objects.filter(
                assignment_id=OuterRef("assignment_id"), student_id=OuterRef("student_id")
            ).order_by("-version").values("id")[:1]
            submissions = Submission.objects.filter(assignment=assignment, id=Subquery(latest)).order_by("student_id")
        elif request.user.role == User.Role.STUDENT:
            submissions = Submission.objects.filter(assignment=assignment, student=request.user)
        else:
            return Response(status=status.HTTP_403_FORBIDDEN)
        return Response(SubmissionSerializer(submissions, many=True).data)

    def post(self, request, assignment_id):
        assignment = scoped_assignment(request.user, assignment_id)
        if request.user.role != User.Role.STUDENT:
            return Response(status=status.HTTP_403_FORBIDDEN)
        if not can_submit(assignment):
            return Response(
                {"detail": "Submissions are accepted only before the deadline while the Class is open."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        serializer = SubmissionUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        submission = create_submission(
            assignment=assignment,
            student=request.user,
            upload=serializer.validated_data["file"],
            note=serializer.validated_data.get("note", ""),
        )
        return Response(SubmissionSerializer(submission).data, status=status.HTTP_201_CREATED)


class SubmissionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, submission_id):
        return Response(SubmissionSerializer(self.get_submission(request, submission_id)).data)

    def get_submission(self, request, submission_id):
        submissions = Submission.objects.select_related("assignment__classroom")
        if request.user.role == User.Role.TEACHER:
            submissions = submissions.filter(assignment__classroom__teacher=request.user)
        elif request.user.role == User.Role.STUDENT:
            submissions = submissions.filter(student=request.user)
        else:
            submissions = submissions.none()
        return get_object_or_404(submissions, id=submission_id)


class SubmissionDownloadView(SubmissionDetailView):
    def get(self, request, submission_id):
        submission = self.get_submission(request, submission_id)
        return FileResponse(
            default_storage.open(submission.file_path, "rb"),
            as_attachment=True,
            filename=submission.original_filename,
        )
