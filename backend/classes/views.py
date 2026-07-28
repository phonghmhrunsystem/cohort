from django.apps import apps
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from audit.services import write_audit

from .models import Class, Enrollment
from .serializers import ClassSerializer, EnrollmentSerializer, EnrollmentSetSerializer


def scoped_classes(user):
    if user.role == User.Role.ADMIN:
        return Class.objects.all()
    if user.role == User.Role.TEACHER:
        return Class.objects.filter(teacher=user)
    if user.role == User.Role.STUDENT:
        return Class.objects.filter(enrollments__student=user)
    return Class.objects.none()


class ClassesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        classes = scoped_classes(request.user)
        if query := request.query_params.get("q", "").strip():
            classes = classes.filter(name__icontains=query)
        return Response(ClassSerializer(classes.order_by("id").distinct(), many=True).data)

    def post(self, request):
        if request.user.role != User.Role.ADMIN:
            return Response(status=status.HTTP_403_FORBIDDEN)
        serializer = ClassSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        with transaction.atomic():
            class_ = serializer.save()
            write_audit(
                actor=request.user,
                action="class.created",
                target=class_,
                metadata=class_metadata(class_),
            )
        return Response(ClassSerializer(class_).data, status=status.HTTP_201_CREATED)


class ClassDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, class_id):
        return Response(ClassSerializer(get_scoped_class(request.user, class_id)).data)

    def patch(self, request, class_id):
        if request.user.role != User.Role.ADMIN:
            return Response(status=status.HTTP_403_FORBIDDEN)
        class_ = get_scoped_class(request.user, class_id)
        if is_ended(class_):
            return closed_response()
        serializer = ClassSerializer(class_, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        with transaction.atomic():
            class_ = serializer.save()
            write_audit(
                actor=request.user,
                action="class.updated",
                target=class_,
                metadata=class_metadata(class_),
            )
        return Response(ClassSerializer(class_).data)


class StudentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, class_id):
        class_ = get_scoped_class(request.user, class_id)
        if request.user.role != User.Role.ADMIN:
            return Response(status=status.HTTP_403_FORBIDDEN)
        students = User.objects.filter(enrollments__classroom=class_, role=User.Role.STUDENT, is_active=True)
        if query := request.query_params.get("q", "").strip():
            students = students.filter(Q(full_name__icontains=query) | Q(email__icontains=query))
        return Response(StudentSerializer(students.order_by("id"), many=True).data)


class EnrollmentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, class_id):
        if request.user.role != User.Role.ADMIN:
            return Response(status=status.HTTP_403_FORBIDDEN)
        class_ = get_scoped_class(request.user, class_id)
        if is_ended(class_):
            return closed_response()
        serializer = EnrollmentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        try:
            with transaction.atomic():
                enrollment = serializer.save(classroom=class_)
                write_audit(
                    actor=request.user,
                    action="enrollment.created",
                    target=enrollment,
                    metadata={"class_id": class_.id, "student_id": enrollment.student_id},
                )
        except IntegrityError:
            return Response(
                {"student_id": ["This Student is already enrolled."]},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        return Response(EnrollmentSerializer(enrollment).data, status=status.HTTP_201_CREATED)

    def delete(self, request, class_id, student_id):
        if request.user.role != User.Role.ADMIN:
            return Response(status=status.HTTP_403_FORBIDDEN)
        class_ = get_scoped_class(request.user, class_id)
        if is_ended(class_) or student_has_submission(class_, student_id):
            return closed_response("Student enrollment cannot be removed after Class end or submission.")
        enrollment = get_object_or_404(Enrollment, classroom=class_, student_id=student_id)
        with transaction.atomic():
            write_audit(actor=request.user, action="enrollment.removed", target=enrollment, metadata={"class_id": class_.id, "student_id": student_id})
            enrollment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def put(self, request, class_id):
        if request.user.role != User.Role.ADMIN:
            return Response(status=status.HTTP_403_FORBIDDEN)
        class_ = get_scoped_class(request.user, class_id)
        serializer = EnrollmentSetSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        requested = {student.id for student in serializer.validated_data["student_ids"]}
        with transaction.atomic():
            current = set(
                Enrollment.objects.select_for_update()
                .filter(classroom=class_)
                .values_list("student_id", flat=True)
            )
            removed = current - requested
            if removed and (is_ended(class_) or any(student_has_submission(class_, student_id) for student_id in removed)):
                return closed_response("Student enrollment cannot be removed after Class end or submission.")
            Enrollment.objects.filter(classroom=class_, student_id__in=removed).delete()
            Enrollment.objects.bulk_create(
                [Enrollment(classroom=class_, student_id=student_id) for student_id in requested - current]
            )
            write_audit(
                actor=request.user,
                action="enrollment.replaced",
                target=class_,
                metadata={"class_id": class_.id, "student_ids": sorted(requested)},
            )
        students = User.objects.filter(id__in=requested, role=User.Role.STUDENT, is_active=True).order_by("id")
        return Response(StudentSerializer(students, many=True).data)


class StudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "full_name", "email")


def get_scoped_class(user, class_id):
    return get_object_or_404(scoped_classes(user), id=class_id)


def is_ended(class_):
    return timezone.now() >= class_.ends_at


def closed_response(detail="Class has ended and is read-only."):
    return Response({"detail": detail}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)


def student_has_submission(class_, student_id):
    try:
        Submission = apps.get_model("submissions", "Submission")
        Assignment = apps.get_model("assignments", "Assignment")
    except LookupError:
        return False
    class_field = next((field for field in Assignment._meta.fields if field.related_model is Class), None)
    if not class_field:
        return False
    assignments = Assignment.objects.filter(**{f"{class_field.name}__id": class_.id})
    return Submission.objects.filter(student_id=student_id, assignment__in=assignments).exists()


def class_metadata(class_):
    return {"teacher_id": class_.teacher_id, "name": class_.name, "description": class_.description, "starts_at": class_.starts_at.isoformat(), "ends_at": class_.ends_at.isoformat()}
