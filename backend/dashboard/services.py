from django.db.models import Count, Q
from django.utils import timezone

from accounts.models import User
from classes.models import Class
from classes.views import open_class_q

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


def admin_dashboard(user):
    now = timezone.now()
    return {
        "role": User.Role.ADMIN,
        "accounts": _account_counts(),
        "classes": _class_buckets(now),
    }
