from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from audit.services import write_audit

from .models import Cohort
from .serializers import CohortSerializer, EnrollmentSerializer


def scoped_cohorts(user):
    if user.role == User.Role.TEACHER:
        return Cohort.objects.filter(teacher=user)
    if user.role == User.Role.STUDENT:
        return Cohort.objects.filter(enrollment__student=user)
    return Cohort.objects.none()


class CohortsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(CohortSerializer(scoped_cohorts(request.user), many=True).data)

    def post(self, request):
        if request.user.role != User.Role.TEACHER:
            return Response(status=status.HTTP_403_FORBIDDEN)
        serializer = CohortSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        with transaction.atomic():
            cohort = serializer.save(teacher=request.user)
            write_audit(
                actor=request.user,
                action="cohort.created",
                target=cohort,
                metadata=cohort_metadata(cohort),
            )
        return Response(CohortSerializer(cohort).data, status=status.HTTP_201_CREATED)


class CohortDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, cohort_id):
        return Response(CohortSerializer(get_scoped_cohort(request.user, cohort_id)).data)

    def patch(self, request, cohort_id):
        if request.user.role != User.Role.TEACHER:
            return Response(status=status.HTTP_403_FORBIDDEN)
        cohort = get_scoped_cohort(request.user, cohort_id)
        serializer = CohortSerializer(cohort, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        with transaction.atomic():
            cohort = serializer.save()
            write_audit(
                actor=request.user,
                action="cohort.updated",
                target=cohort,
                metadata=cohort_metadata(cohort),
            )
        return Response(CohortSerializer(cohort).data)


class EnrollmentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, cohort_id):
        if request.user.role != User.Role.TEACHER:
            return Response(status=status.HTTP_403_FORBIDDEN)
        cohort = get_scoped_cohort(request.user, cohort_id)
        serializer = EnrollmentSerializer(data=request.data, context={"cohort": cohort})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        with transaction.atomic():
            enrollment = serializer.save(cohort=cohort)
            write_audit(
                actor=request.user,
                action="enrollment.created",
                target=enrollment,
                metadata={"cohort_id": cohort.id, "student_id": enrollment.student_id},
            )
        return Response(EnrollmentSerializer(enrollment).data, status=status.HTTP_201_CREATED)


def get_scoped_cohort(user, cohort_id):
    return get_object_or_404(scoped_cohorts(user), id=cohort_id)


def cohort_metadata(cohort):
    return {"teacher_id": cohort.teacher_id, "name": cohort.name, "description": cohort.description}
