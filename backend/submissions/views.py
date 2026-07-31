from django.core.files.storage import default_storage
from django.db.models import OuterRef, Subquery
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from accounts.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from assignments.models import Assignment, AssignmentGrade
from classes.views import scoped_classes

from .models import Submission
from .serializers import (
    SubmissionSerializer,
    SubmissionUploadSerializer,
    TeacherSubmissionRowSerializer,
)
from .services import (
    CLOSED_MESSAGE,
    GRADED_MESSAGE,
    SubmissionRejected,
    can_submit,
    create_submission,
    teacher_download_filename,
)


def scoped_assignment(user, assignment_id):
    return get_object_or_404(
        Assignment.objects.select_related("classroom").filter(
            classroom__in=scoped_classes(user)
        ),
        id=assignment_id,
    )


def teacher_roster_rows(assignment):
    students = (
        User.objects.filter(
            enrollments__classroom=assignment.classroom_id,
            role=User.Role.STUDENT,
            is_deleted=False,
        )
        .order_by("full_name", "id")
    )
    latest = Submission.objects.filter(
        assignment=assignment, student_id=OuterRef("student_id")
    ).order_by("-version").values("id")[:1]
    submissions_by_student = {
        submission.student_id: submission
        for submission in Submission.objects.filter(
            assignment=assignment, id=Subquery(latest)
        ).select_related("grade")
    }
    return [
        {
            "student_id": student.id,
            "student_name": student.full_name,
            "is_active": student.is_active,
            "submission": submissions_by_student.get(student.id),
        }
        for student in students
    ]


class AssignmentSubmissionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, assignment_id):
        assignment = scoped_assignment(request.user, assignment_id)
        if request.user.role == User.Role.TEACHER:
            rows = teacher_roster_rows(assignment)
            return Response(TeacherSubmissionRowSerializer(rows, many=True).data)
        elif request.user.role == User.Role.STUDENT:
            submissions = Submission.objects.filter(
                assignment=assignment, student=request.user
            ).select_related("grade", "student")
            return Response(SubmissionSerializer(submissions, many=True).data)
        return Response(status=status.HTTP_403_FORBIDDEN)

    def post(self, request, assignment_id):
        assignment = scoped_assignment(request.user, assignment_id)
        if request.user.role != User.Role.STUDENT:
            return Response(status=status.HTTP_403_FORBIDDEN)
        if AssignmentGrade.objects.filter(assignment=assignment, student=request.user).exists():
            return Response(
                {"detail": GRADED_MESSAGE},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        if not can_submit(assignment):
            return Response(
                {"detail": CLOSED_MESSAGE},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        serializer = SubmissionUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        try:
            submission = create_submission(
                assignment=assignment,
                student=request.user,
                upload=serializer.validated_data["file"],
            )
        except SubmissionRejected as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY
            )
        return Response(SubmissionSerializer(submission).data, status=status.HTTP_201_CREATED)


class SubmissionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, submission_id):
        submission = self.get_submission(request, submission_id)
        context = {"omit_version": request.user.role == User.Role.TEACHER}
        return Response(SubmissionSerializer(submission, context=context).data)

    def get_submission(self, request, submission_id):
        submissions = Submission.objects.select_related("assignment__classroom", "grade", "student")
        if request.user.role == User.Role.TEACHER:
            latest = Submission.objects.filter(
                assignment_id=OuterRef("assignment_id"), student_id=OuterRef("student_id")
            ).order_by("-version").values("id")[:1]
            submissions = submissions.filter(
                assignment__classroom__teacher=request.user,
                id=Subquery(latest),
            )
        elif request.user.role == User.Role.STUDENT:
            submissions = submissions.filter(student=request.user)
        else:
            submissions = submissions.none()
        return get_object_or_404(submissions, id=submission_id)


class SubmissionDownloadView(SubmissionDetailView):
    def get(self, request, submission_id):
        submission = self.get_submission(request, submission_id)
        filename = (
            teacher_download_filename(submission)
            if request.user.role == User.Role.TEACHER
            else submission.original_filename
        )
        return FileResponse(
            default_storage.open(submission.file_path, "rb"),
            as_attachment=True,
            filename=filename,
        )
