from django.apps import apps
from django.db import IntegrityError, connection, transaction
import csv

from django.db.models import Count, F, OuterRef, Prefetch, Q, Subquery
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from accounts.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from assignments.models import Assignment
from assignments.services import LEARNING_STATE_LABELS
from audit.services import write_audit
from notifications.services import create_notifications, notify_user
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
        return Class.objects.select_related("teacher").filter(teacher=user, is_active=True)
    if user.role == User.Role.STUDENT:
        return Class.objects.select_related("teacher").filter(enrollments__student=user, is_active=True)
    return Class.objects.none()


class ClassesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        classes = scoped_classes(request.user).annotate(student_count=Count("enrollments", distinct=True))
        if query := request.query_params.get("q", "").strip():
            classes = classes.filter(name__icontains=query)
        if request.user.role == User.Role.ADMIN and (teacher := request.query_params.get("teacher", "").strip()):
            classes = classes.filter(Q(teacher__full_name__icontains=teacher) | Q(teacher_id=teacher if teacher.isdigit() else None))
        context = {"student": request.user} if request.user.role == User.Role.STUDENT else {}
        paginator = PageNumberPagination()
        paginator.page_size = 10
        page = paginator.paginate_queryset(classes.order_by("id").distinct(), request)
        return Response(paginator.get_paginated_response(ClassSerializer(page, many=True, context=context).data).data)

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
        is_extension = isinstance(request.data, dict) and set(request.data.keys()) == {"ends_at"}
        if is_ended(class_) and not is_extension:
            return closed_response()
        previous_teacher_id = class_.teacher_id
        serializer = ClassSerializer(class_, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        was_ended = is_ended(class_)
        if is_extension and was_ended and serializer.validated_data["ends_at"] <= timezone.now():
            return closed_response("Extension must move ends_at into the future.")
        with transaction.atomic():
            class_ = serializer.save()
            write_audit(
                actor=request.user,
                action="class.reopened" if (is_extension and was_ended) else "class.updated",
                target=class_,
                metadata=class_metadata(class_),
            )
            if class_.teacher_id != previous_teacher_id:
                write_audit(
                    actor=request.user,
                    action="class.teacher_changed",
                    target=class_,
                    metadata={"from_teacher_id": previous_teacher_id, "to_teacher_id": class_.teacher_id},
                )
                notify_user(User.objects.get(id=previous_teacher_id), "CLASS_UNASSIGNED", f"Unassigned from {class_.name}", None)
                notify_user(class_.teacher, "CLASS_ASSIGNED", f"Assigned to {class_.name}", f"/teacher/classes/{class_.id}")
        return Response(ClassSerializer(class_).data)


class ClassStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, class_id):
        if request.user.role != User.Role.ADMIN:
            return Response(status=status.HTTP_403_FORBIDDEN)
        class_ = get_scoped_class(request.user, class_id)
        is_active = request.data.get("is_active")
        if not isinstance(is_active, bool):
            return Response({"is_active": ["This field is required."]}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        if is_active is False and timezone.now() >= class_.starts_at:
            return closed_response("Class cannot be disabled once it has started.")
        with transaction.atomic():
            class_.is_active = is_active
            class_.save(update_fields=("is_active", "updated_at"))
            write_audit(
                actor=request.user,
                action="class.status_changed",
                target=class_,
                metadata={"is_active": is_active},
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
        # ASCII filename on purpose: a Vietnamese Class name would need RFC 5987 encoding.
        response["Content-Disposition"] = f'attachment; filename="gradebook-{classroom.id}.csv"'
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
                *[csv_value(gradebook_cell_text(grade)) for grade in student["grades"]],
            ])
        return response


class StudentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, class_id):
        class_ = get_scoped_class(request.user, class_id)
        if request.query_params.get("candidates") == "1":
            if request.user.role != User.Role.ADMIN:
                return Response(status=status.HTTP_403_FORBIDDEN)
            students = User.objects.filter(
                role=User.Role.STUDENT, is_active=True, is_deleted=False
            )
            if query := request.query_params.get("q", "").strip():
                students = students.filter(Q(full_name__icontains=query) | Q(email__icontains=query))
            return Response(StudentSerializer(students.order_by("id"), many=True).data)
        if request.user.role not in (User.Role.ADMIN, User.Role.TEACHER):
            return Response(status=status.HTTP_403_FORBIDDEN)
        students = list(students_progress_queryset(class_).order_by("id"))
        rows = students_progress_queryset(class_).order_by("id")
        if query := request.query_params.get("q", "").strip():
            rows = rows.filter(Q(full_name__icontains=query) | Q(email__icontains=query))
        paginator = PageNumberPagination()
        paginator.page_size = 10
        page = paginator.paginate_queryset(rows, request)
        return Response(
            {
                "total_assignments": class_.assignments.count(),
                "enrolled_students": len(students),
                "submitted_students": sum(1 for s in students if s.submitted_assignments > 0),
                "graded_students": sum(1 for s in students if s.graded_assignments > 0),
                "students": paginator.get_paginated_response(StudentProgressSerializer(page, many=True).data).data,
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
        students = User.objects.filter(
            id__in=requested,
            role=User.Role.STUDENT,
            is_active=True,
            is_deleted=False,
        ).order_by("id")
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
    """Enrolled, non-deleted Students annotated with backend-computed progress counts
    and enrollment date (never derive these from a filtered list on the frontend)."""
    return User.objects.filter(
        enrollments__classroom=class_, role=User.Role.STUDENT, is_deleted=False
    ).annotate(
        enrolled_at=F("enrollments__created_at"),
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
    """Admins see the Class but cannot open its gradebook (None -> 403); everyone
    else must own it, so Students and other Teachers fall through to 404.
    Deliberately not scoped_classes(): an ended or disabled Class must stay
    exportable, which is when a gradebook matters most."""
    if user.role == User.Role.ADMIN:
        return None
    return get_object_or_404(Class.objects.filter(teacher=user), id=class_id)


def gradebook_data(classroom):
    students = list(
        User.objects.filter(
            enrollments__classroom=classroom,
            role=User.Role.STUDENT,
            is_deleted=False,
        ).order_by("full_name", "id")
    )
    latest = Submission.objects.filter(
        assignment_id=OuterRef("assignment_id"),
        student_id=OuterRef("student_id"),
    ).order_by("-version").values("id")[:1]
    assignments = list(
        Assignment.objects.filter(classroom=classroom).order_by("created_at", "id").select_related("classroom").prefetch_related(
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


def gradebook_cell_text(grade):
    if grade["learning_state"] == "GRADED":
        return str(grade["score"])
    return LEARNING_STATE_LABELS[grade["learning_state"]]


def csv_value(value):
    value = str(value)
    return f"'{value}" if value.startswith(("=", "+", "-", "@")) else value


class StudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "full_name", "email", "phone", "hometown", "is_active")


def get_scoped_class(user, class_id):
    return get_object_or_404(scoped_classes(user), id=class_id)


def is_ended(class_):
    return timezone.now() >= class_.ends_at


def is_open(class_):
    now = timezone.now()
    return class_.is_active and class_.starts_at <= now < class_.ends_at


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
