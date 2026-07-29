from submissions.models import Submission


_MISSING = object()


def assignment_learning_state(assignment, student, now, latest_submission=_MISSING):
    latest = latest_submission
    if latest is _MISSING:
        latest = (
            Submission.objects.filter(assignment=assignment, student=student)
            .select_related("grade")
            .order_by("-version")
            .first()
        )
    if latest and hasattr(latest, "grade"):
        return "GRADED"
    if (
        assignment.classroom.starts_at <= now < assignment.classroom.ends_at
        and now < assignment.due_at
    ):
        return "SUBMITTED" if latest else "OPEN"
    return "CLOSED"


def deadline_badge(due_at, now):
    if now >= due_at:
        return "Đã hết hạn"
    days = (due_at.date() - now.date()).days
    if not days:
        return "Còn hôm nay"
    return f"Còn {days} ngày"


def closure_reason(assignment, now):
    if now < assignment.classroom.starts_at:
        return "Class has not started."
    if now >= assignment.classroom.ends_at:
        return "Class has ended."
    if now >= assignment.due_at:
        return "Deadline has passed."
    return None
