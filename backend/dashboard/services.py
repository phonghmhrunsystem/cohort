from django.db.models import Count

from accounts.models import User

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


def admin_dashboard(user):
    return {"role": User.Role.ADMIN, "accounts": _account_counts()}
