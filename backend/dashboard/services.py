from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone

from accounts.models import User
from assignments.models import Assignment, AssignmentGrade
from audit.labels import resolve_labels
from audit.models import AuditLog
from classes.models import Class, Enrollment
from classes.views import open_class_q, scoped_classes
from submissions.models import Submission

_ROLE_KEYS = {User.Role.ADMIN: "admins", User.Role.TEACHER: "teachers", User.Role.STUDENT: "students"}


def _account_counts():
    """Một query cho cả ba role. Mặc định 0 cho role không có account nào —
    khoá thiếu sẽ làm vỡ thẻ ở frontend, số 0 thì không."""
    counts = dict.fromkeys(_ROLE_KEYS.values(), 0)
    rows = User.objects.filter(is_deleted=False).values("role").annotate(total=Count("id"))
    for row in rows:
        key = _ROLE_KEYS.get(row["role"])
        if key:
            counts[key] = row["total"]
    return counts


def _class_buckets(now):
    """Bốn nhóm loại trừ lẫn nhau, một query. `disabled` xét trước và bỏ qua
    ngày tháng — lớp đã tắt thì cửa sổ thời gian của nó không còn nghĩa gì."""
    active = Q(is_active=True)
    return Class.objects.aggregate(
        running=Count("id", filter=open_class_q(now)),
        scheduled=Count("id", filter=active & Q(starts_at__gt=now)),
        ended=Count("id", filter=active & Q(ends_at__lte=now)),
        disabled=Count("id", filter=Q(is_active=False)),
    )


_RECENT_AUDIT_LIMIT = 5


def _recent_audit():
    logs = list(AuditLog.objects.select_related("actor")[:_RECENT_AUDIT_LIMIT])
    labels = resolve_labels(logs)
    return [
        {
            "id": log.id,
            "action": log.action,
            "target_label": labels.get(log.id, ""),
            "actor": {"id": log.actor_id, "full_name": log.actor.full_name, "role": log.actor.role},
            "created_at": log.created_at,
        }
        for log in logs
    ]


def admin_dashboard(user):
    now = timezone.now()
    return {
        "role": User.Role.ADMIN,
        "accounts": _account_counts(),
        "classes": _class_buckets(now),
        "recent_audit": _recent_audit(),
    }


def _ungraded_submissions(class_ids):
    """Bản nộp thuộc một cặp (assignment, student) chưa có `AssignmentGrade`.
    Task 7 dùng lại chính queryset này cho danh sách chờ chấm."""
    graded = AssignmentGrade.objects.filter(
        assignment=OuterRef("assignment_id"), student=OuterRef("student_id")
    )
    return (
        Submission.objects.filter(assignment__classroom_id__in=class_ids)
        .annotate(is_graded=Exists(graded))
        .filter(is_graded=False)
    )


def teacher_dashboard(user):
    now = timezone.now()
    classes = scoped_classes(user)
    class_ids = list(classes.values_list("id", flat=True))
    open_ids = list(classes.filter(open_class_q(now)).values_list("id", flat=True))

    cards = {
        "my_classes": len(class_ids),
        "running_classes": len(open_ids),
        "open_assignments": Assignment.objects.filter(
            classroom_id__in=open_ids, due_at__gt=now
        ).count(),
        # distinct: một người học hai lớp của cùng teacher vẫn là một người.
        "students": Enrollment.objects.filter(classroom_id__in=class_ids)
        .values("student_id").distinct().count(),
        # distinct trên cặp: ba bản nộp của một người vẫn là một việc phải chấm.
        "pending_grading": _ungraded_submissions(class_ids)
        .values("assignment_id", "student_id").distinct().count(),
    }
    return {"role": User.Role.TEACHER, "cards": cards}
