import re
from pathlib import Path
from time import sleep
from uuid import uuid4

from django.core.files.storage import default_storage
from django.db import OperationalError, connection, transaction
from django.http import Http404
from django.utils import timezone

from audit.services import write_audit
from assignments.models import Assignment, AssignmentGrade
from classes.models import Enrollment
from classes.views import is_open

from .models import Submission

CLOSED_MESSAGE = "Submissions are accepted only before the deadline while the Class is open."
GRADED_MESSAGE = "This Assignment has already been graded."


class SubmissionRejected(Exception):
    pass


_UNSAFE_FILENAME_CHARS = re.compile(r"[\\/\x00-\x1f]")


def teacher_download_filename(submission):
    name = submission.student.full_name or f"Student {submission.student_id}"
    name = _UNSAFE_FILENAME_CHARS.sub("", name).strip()
    if not name:
        name = f"Student {submission.student_id}"
    name = name[:150]
    return f"{name}_{submission.original_filename}"


def can_submit(assignment):
    return is_open(assignment.classroom) and timezone.now() < assignment.due_at


def create_submission(*, assignment, student, upload):
    for attempt in range(3):
        storage_name = None
        try:
            with transaction.atomic():
                enrollments = Enrollment.objects.filter(
                    classroom_id=assignment.classroom_id, student=student
                )
                try:
                    if connection.features.has_select_for_update:
                        enrollments.select_for_update().get()
                    # ponytail: SQLite-wide write lock; move off SQLite if write throughput matters.
                    elif not enrollments.update(student_id=student.id):
                        raise Enrollment.DoesNotExist
                except Enrollment.DoesNotExist:
                    raise Http404 from None

                try:
                    assignment = Assignment.objects.select_related("classroom").get(
                        id=assignment.id
                    )
                except Assignment.DoesNotExist:
                    raise Http404 from None
                latest = Submission.objects.filter(
                    assignment=assignment, student=student
                ).order_by("-version").first()

                if not can_submit(assignment):
                    raise SubmissionRejected(CLOSED_MESSAGE)
                if AssignmentGrade.objects.filter(
                    assignment=assignment, student=student
                ).exists():
                    raise SubmissionRejected(GRADED_MESSAGE)

                storage_name = default_storage.save(
                    f"submissions/{uuid4().hex}{Path(upload.name).suffix.lower()}", upload
                )
                submission = Submission.objects.create(
                    assignment=assignment,
                    student=student,
                    version=(latest.version if latest else 0) + 1,
                    file_path=storage_name,
                    original_filename=upload.name,
                    content_type=upload.content_type,
                    size=upload.size,
                )
                write_audit(
                    actor=student,
                    action="submission.created",
                    target=submission,
                    metadata={
                        "assignment_id": assignment.id,
                        "student_id": student.id,
                        "version": submission.version,
                    },
                )
            return submission
        except Exception as exc:
            if storage_name:
                default_storage.delete(storage_name)
            if (
                isinstance(exc, OperationalError)
                and connection.vendor == "sqlite"
                and "locked" in str(exc).lower()
                and attempt < 2
            ):
                sleep(0.05 * (attempt + 1))
                continue
            raise
