from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from accounts.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from audit.services import write_audit
from classes.views import scoped_classes
from notifications.services import create_notifications

from .models import Assignment, RubricCriterion
from .serializers import AssignmentSerializer, RubricSerializer


def assigned_class(user, class_id):
    classroom = get_object_or_404(scoped_classes(user), id=class_id)
    require_assigned_teacher(user, classroom)
    return classroom


def scoped_assignment(user, assignment_id):
    """Read-only lookup: scoped_classes(user) already restricts a student to
    their own enrolled classes and a teacher to their own classes, so no
    further ownership check is needed for reads."""
    return get_object_or_404(
        Assignment.objects.select_related("classroom").filter(
            classroom__in=scoped_classes(user)
        ),
        id=assignment_id,
    )


def assigned_assignment(user, assignment_id):
    assignment = scoped_assignment(user, assignment_id)
    require_assigned_teacher(user, assignment.classroom)
    return assignment


def require_assigned_teacher(user, classroom):
    if classroom.teacher_id != user.id:
        raise PermissionDenied


def is_open(classroom):
    now = timezone.now()
    return classroom.starts_at <= now < classroom.ends_at


def closed_response():
    return Response({"detail": "Coursework is available only while the Class is open."}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)


class ClassAssignmentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, class_id):
        classroom = get_object_or_404(scoped_classes(request.user), id=class_id)
        if request.user.role not in (User.Role.TEACHER, User.Role.STUDENT):
            return Response(status=status.HTTP_403_FORBIDDEN)
        context = {"classroom": classroom}
        if request.user.role == User.Role.STUDENT:
            context["student"] = request.user
        return Response(AssignmentSerializer(classroom.assignments.all(), many=True, context=context).data)

    def post(self, request, class_id):
        classroom = assigned_class(request.user, class_id)
        if not is_open(classroom):
            return closed_response()
        serializer = AssignmentSerializer(data=request.data, context={"classroom": classroom})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        with transaction.atomic():
            assignment = serializer.save(classroom=classroom)
            create_notifications(classroom, "ASSIGNMENT_CREATED", f"New assignment: {assignment.title}", f"/student/assignments/{assignment.id}")
            write_audit(actor=request.user, action="assignment.created", target=assignment, metadata={"class_id": classroom.id, "assignment_id": assignment.id})
        return Response(AssignmentSerializer(assignment, context={"classroom": classroom}).data, status=status.HTTP_201_CREATED)


class AssignmentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, assignment_id):
        if request.user.role not in (User.Role.TEACHER, User.Role.STUDENT):
            return Response(status=status.HTTP_403_FORBIDDEN)
        assignment = scoped_assignment(request.user, assignment_id)
        context = {"classroom": assignment.classroom}
        if request.user.role == User.Role.STUDENT:
            context["student"] = request.user
        return Response(AssignmentSerializer(assignment, context=context).data)

    def patch(self, request, assignment_id):
        assignment = assigned_assignment(request.user, assignment_id)
        if not is_open(assignment.classroom):
            return closed_response()
        serializer = AssignmentSerializer(assignment, data=request.data, partial=True, context={"classroom": assignment.classroom})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        with transaction.atomic():
            assignment = serializer.save()
            write_audit(actor=request.user, action="assignment.updated", target=assignment, metadata={"class_id": assignment.classroom_id, "assignment_id": assignment.id})
        return Response(AssignmentSerializer(assignment, context={"classroom": assignment.classroom}).data)


class AssignmentRubricView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, assignment_id):
        from grading.models import Grade
        from grading.services import ALREADY_GRADED_MESSAGE

        assignment = assigned_assignment(request.user, assignment_id)
        if not is_open(assignment.classroom):
            return closed_response()
        if Grade.objects.filter(assignment=assignment).exists():
            return Response({"detail": ALREADY_GRADED_MESSAGE}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        serializer = RubricSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        with transaction.atomic():
            assignment.criteria.all().delete()
            RubricCriterion.objects.bulk_create([RubricCriterion(assignment=assignment, **criterion) for criterion in serializer.validated_data["criteria"]])
            write_audit(actor=request.user, action="assignment.rubric.updated", target=assignment, metadata={"class_id": assignment.classroom_id, "assignment_id": assignment.id})
        return Response(AssignmentSerializer(assignment, context={"classroom": assignment.classroom}).data)
