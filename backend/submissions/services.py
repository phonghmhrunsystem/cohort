from pathlib import Path
from uuid import uuid4

from django.core.files.storage import default_storage
from django.db import transaction

from audit.services import write_audit

from .models import Submission


def create_submission(*, assignment, student, upload, note):
    storage_name = None
    try:
        with transaction.atomic():
            latest = Submission.objects.select_for_update().filter(
                assignment=assignment, student=student
            ).order_by("-version").first()
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
                note=note,
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
    except Exception:
        if storage_name:
            default_storage.delete(storage_name)
        raise
