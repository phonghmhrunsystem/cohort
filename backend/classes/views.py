from django.apps import apps
from django.db import IntegrityError, connection, transaction
import csv

from django.db.models import Count, F, OuterRef, Prefetch, Q, Subquery
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from accounts.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from assignments.models import Assignment
from audit.services import write_audit
from notifications.services import create_notifications
from submissions.models import Submission

from .models import Class, ClassResource, Enrollment
from .serializers import (
    ClassSerializer,
    EnrollmentSerializer,
    EnrollmentSetSerializer,
    GradebookSerializer,
    StudentProfileSerializer,
    StudentProgressSerializer,
    ClassResourceSerializer,
)


def scoped_classes(user):
    if user.role == User.Role.ADMIN:
        return Class.objects.select_related("teacher")
    if user.role == User.Role.TEACHER:
        return Class.objects.select_related("teacher").filter(teacher=user)
    if user.role == User.Role.STUDENT:
        return Class.objects.select_related("teacher").filter(enrollments__student=user)
    return Class.objects.none()


class ClassesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        classes = scoped_classes(request.user)
        if query := request.query_params.get("q", "").strip():
            classes = classes.filter(name__icontains=query)
        context = {"student": request.user} if request.user.role == User.Role.STUDENT else {}
        return Response(ClassSerializer(classes.order_by("id").distinct(), many=True, context=context).data)

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
        context = {"student": request.user} if request.user.role == User.Role.STUDENT else {}
        return Response(ClassSerializer(get_scoped_class(request.user, class_id), context=context).data)

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


class GradebookView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, class_id):
        classroom = teacher_gradebook_class(request.user, class_id)
        if classroom is None:
            return Response(status=status.HTTP_403_FORBIDDEN)
        return Response(gradebook_data(classroom))


class GradebookCsvView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, class_id):
        classroom = teacher_gradebook_class(request.user, class_id)
        if classroom is None:
            return Response(status=status.HTTP_403_FORBIDDEN)
        gradebook = gradebook_data(classroom)
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response.write("\ufeff")
        writer = csv.writer(response)
        assignments = gradebook["assignments"]
        writer.writerow(["Họ tên", "Email", *[
            csv_value(f"{assignment['title']} ({assignment['maximum_score']})")
            for assignment in assignments
        ]])
        for student in gradebook["students"]:
            writer.writerow([
                csv_value(student["full_name"] or ""),
                csv_value(student["email"]),
                *[
                    f"{grade['learning_state']}: {grade['score']}" if grade["score"] is not None else grade["learning_state"]
                    for grade in student["grades"]
                ],
            ])
        return response


class StudentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, class_id):
        class_ = get_scoped_class(request.user, class_id)
        if request.query_params.get("candidates") == "1":
            if request.user.role != User.Role.ADMIN:
                return Response(status=status.HTTP_403_FORBIDDEN)
            students = User.objects.filter(role=User.Role.STUDENT, is_active=True)
            if query := request.query_params.get("q", "").strip():
                students = students.filter(Q(full_name__icontains=query) | Q(email__icontains=query))
            return Response(StudentSerializer(students.order_by("id"), many=True).data)
        if request.user.role not in (User.Role.ADMIN, User.Role.TEACHER):
            return Response(status=status.HTTP_403_FORBIDDEN)
        students = list(students_progress_queryset(class_).order_by("id"))
        rows = students
        if query := request.query_params.get("q", "").strip():
            rows = list(
                students_progress_queryset(class_)
                .filter(Q(full_name__icontains=query) | Q(email__icontains=query))
                .order_by("id")
            )
        return Response(
            {
                "total_assignments": class_.assignments.count(),
                "enrolled_students": len(students),
                "submitted_students": sum(1 for s in students if s.submitted_assignments > 0),
                "graded_students": sum(1 for s in students if s.graded_assignments > 0),
                "students": StudentProgressSerializer(rows, many=True).data,
            }
        )


class StudentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, class_id, student_id):
        class_ = get_scoped_class(request.user, class_id)
        if request.user.role not in (User.Role.ADMIN, User.Role.TEACHER):
            return Response(status=status.HTTP_403_FORBIDDEN)
        student = get_object_or_404(students_progress_queryset(class_), id=student_id)
        total_assignments = class_.assignments.count()
        data = StudentProfileSerializer(student, context={"teacher": class_.teacher}).data
        data["total_assignments"] = total_assignments
        return Response(data)


class EnrollmentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, class_id):
        if request.user.role not in (User.Role.ADMIN, User.Role.TEACHER):
            return Response(status=status.HTTP_403_FORBIDDEN)
        class_ = get_scoped_class(request.user, class_id)
        students = User.objects.filter(enrollments__classroom=class_, role=User.Role.STUDENT)
        if query := request.query_params.get("q", "").strip():
            students = students.filter(Q(full_name__icontains=query) | Q(email__icontains=query))
        return Response(StudentSerializer(students.order_by("id"), many=True).data)

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
            class_rows = Class.objects.filter(id=class_.id)
            if connection.features.has_select_for_update:
                class_ = get_object_or_404(class_rows.select_for_update())
            else:
                # ponytail: SQLite locks the database; use a row-locking database if write throughput matters.
                class_rows.update(id=F("id"))
                class_ = get_object_or_404(class_rows)
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


class ClassResourcesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, class_id):
        classroom = get_scoped_class(request.user, class_id)
        if request.user.role not in (User.Role.TEACHER, User.Role.STUDENT): return Response(status=status.HTTP_403_FORBIDDEN)
        return Response(ClassResourceSerializer(classroom.resources.all(), many=True).data)

    def post(self, request, class_id):
        classroom = get_object_or_404(Class.objects.filter(id=class_id, teacher=request.user), id=class_id)
        serializer = ClassResourceSerializer(data=request.data)
        if not serializer.is_valid(): return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        with transaction.atomic():
            resource = serializer.save(classroom=classroom)
            create_notifications(classroom, "RESOURCE_CREATED", f"New resource: {resource.title}", f"/student/classes/{classroom.id}")
        return Response(ClassResourceSerializer(resource).data, status=status.HTTP_201_CREATED)


def students_progress_queryset(class_):
    """Enrolled, active Students annotated with backend-computed progress counts
    (never derive these from a filtered list on the frontend)."""
    return User.objects.filter(
        enrollments__classroom=class_, role=User.Role.STUDENT, is_active=True
    ).annotate(
        submitted_assignments=Count(
            "submissions__assignment",
            filter=Q(submissions__assignment__classroom=class_),
            distinct=True,
        ),
        graded_assignments=Count(
            "grading_grades__assignment",
            filter=Q(grading_grades__assignment__classroom=class_),
            distinct=True,
        ),
    )


def teacher_gradebook_class(user, class_id):
    if user.role != User.Role.TEACHER:
        return None
    return get_object_or_404(Class.objects.filter(teacher=user), id=class_id)


def gradebook_data(classroom):
    students = list(
        User.objects.filter(
            enrollments__classroom=classroom,
            role=User.Role.STUDENT,
            is_active=True,
        ).order_by("id")
    )
    latest = Submission.objects.filter(
        assignment_id=OuterRef("assignment_id"),
        student_id=OuterRef("student_id"),
    ).order_by("-version").values("id")[:1]
    assignments = list(
        Assignment.objects.filter(classroom=classroom).prefetch_related(
            Prefetch(
                "submissions",
                queryset=Submission.objects.filter(
                    student__in=students,
                    id=Subquery(latest),
                ).select_related("grade"),
                to_attr="gradebook_submissions",
            )
        )
    )
    latest_submissions = {
        (assignment.id, submission.student_id): submission
        for assignment in assignments
        for submission in assignment.gradebook_submissions
    }
    return GradebookSerializer(
        {"assignments": assignments, "students": students},
        context={"now": timezone.now(), "latest_submissions": latest_submissions},
    ).data


def csv_value(value):
    value = str(value)
    return f"'{value}" if value.startswith(("=", "+", "-", "@")) else value


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
