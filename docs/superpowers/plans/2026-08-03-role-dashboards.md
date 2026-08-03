# Role Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: dùng `superpowers:subagent-driven-development` (khuyến nghị) hoặc `superpowers:executing-plans` để chạy plan này theo từng task. Các bước dùng cú pháp checkbox (`- [ ]`).

**Goal:** Biến `/dashboard` từ một `Card` stub 7 dòng thành màn hình đầu tiên có ích cho cả ba role, ăn từ một endpoint mới `GET /api/dashboard` đổi hình payload theo role người gọi.

**Architecture:** App Django mới `backend/dashboard/` không sở hữu bảng nào; toàn bộ truy vấn nằm trong `dashboard/services.py`, `views.py` chỉ chọn hàm theo `request.user.role`. Scope tái dùng `classes.views.scoped_classes`; cửa sổ lớp tái dùng `is_open` (in-memory) và `open_class_q` (điều kiện `WHERE`, thêm mới ở Task 1). Frontend tách `DashboardPage` (chỗ duy nhất biết về mạng) khỏi ba view thuần nhận payload qua props.

**Tech Stack:** Django 5 + DRF (`backend/`), React 19 + Vite + TypeScript + react-router-dom (`frontend/src`). Test: `cd backend && python manage.py test`, `cd frontend && npm test`.

**Spec:** `docs/superpowers/specs/2026-08-03-role-dashboards-design.md`

## Global Constraints

- **Plan này phụ thuộc `docs/plans/08-audit-log-plan.md`.** Task 5 (`recent_audit`) cần `audit/labels.py::resolve_labels` và `frontend/src/lib/auditActions.ts` do plan 08 tạo. Chạy xong plan 08 trước khi bắt đầu Task 5. Task 1–4 và 6–13 không phụ thuộc.
- Dashboard **chỉ đọc**: không `write_audit`, không POST/PUT/DELETE, không model mới, không migration.
- Scope do server ép qua `classes.views.scoped_classes(user)` — không viết filter scope mới ở app `dashboard`.
- Cửa sổ lớp: `is_active and starts_at <= now < ends_at`. Không viết lại điều kiện này inline ở bất kỳ đâu; dùng `open_class_q(now)`.
- Ngân sách truy vấn: **≤ 8 query cố định mỗi role**, không phụ thuộc số lớp/bài/học viên. Không vòng lặp Python chạy query.
- `permission_classes = [IsAuthenticated]` lấy từ `accounts.permissions` (không phải của DRF) — nó chặn cả người đang `must_change_password`.
- Status: `401` ẩn danh, `403` khi `must_change_password`. Không có `404`.
- Không thêm thư viện frontend nào (không chart).
- Giữ nguyên việc không đụng file ngoài phạm vi feature này.

---

## File Structure

**Backend**

| File | Trách nhiệm |
|---|---|
| `backend/classes/views.py` | sửa: thêm `open_class_q(now=None)` ngay dưới `is_open` |
| `backend/classes/tests/test_classes.py` | sửa: test đồng thuận `is_open` ↔ `open_class_q` |
| `backend/dashboard/__init__.py` | tạo |
| `backend/dashboard/services.py` | tạo: `admin_dashboard(user)`, `teacher_dashboard(user)`, `student_dashboard(user)` — mọi truy vấn nằm ở đây |
| `backend/dashboard/serializers.py` | tạo: ba serializer, một cho mỗi hình payload |
| `backend/dashboard/views.py` | tạo: `DashboardView`, không có logic truy vấn |
| `backend/dashboard/urls.py` | tạo |
| `backend/dashboard/tests/__init__.py`, `backend/dashboard/tests/test_dashboard.py` | tạo |
| `backend/config/settings.py` | sửa: thêm `"dashboard"` vào `INSTALLED_APPS` |
| `backend/config/urls.py` | sửa: `include(dashboard_urls)` |

Không có `backend/dashboard/models.py` và không có `backend/dashboard/migrations/`.

**Frontend**

| File | Trách nhiệm |
|---|---|
| `frontend/src/types.ts` | sửa: `AdminDashboard`, `TeacherDashboard`, `StudentDashboard`, union `DashboardData` |
| `frontend/src/components/StatCard.tsx` | tạo: số lớn + nhãn + tone |
| `frontend/src/pages/DashboardPage.tsx` | sửa: fetch + loading/lỗi + chuyển tiếp theo `data.role` |
| `frontend/src/pages/dashboard/AdminDashboardView.tsx` | tạo |
| `frontend/src/pages/dashboard/TeacherDashboardView.tsx` | tạo |
| `frontend/src/pages/dashboard/StudentDashboardView.tsx` | tạo |
| `frontend/src/styles.css` | sửa: class `.stat-card`, `.stat-grid` |
| `frontend/src/test/pages/DashboardPage.test.tsx` | tạo |
| `frontend/src/test/pages/dashboard-views.test.tsx` | tạo |

**Docs**

| File | Trách nhiệm |
|---|---|
| `docs/overview/09-dashboard.md` | tạo (Task 13) |
| `docs/overview/00-system-overview.md` | sửa: thêm dòng `dashboard` vào bảng §5 (Task 13) |

---

## Backend

Chạy test: `cd backend && python manage.py test dashboard classes`.

### Task 1: `open_class_q` — cửa sổ lớp dưới dạng điều kiện `WHERE`

**Files:**
- Modify: `backend/classes/views.py` (ngay dưới `is_open`, khoảng dòng 519-522)
- Test: `backend/classes/tests/test_classes.py`

**Interfaces:**
- Consumes: `classes.models.Class`, `classes.views.is_open`.
- Produces: `classes.views.open_class_q(now=None) -> django.db.models.Q` — mọi task sau import từ đây.

`is_open` nhận một instance đã nạp nên không đặt được vào `.filter()`. Dashboard cần đếm lớp đang mở bằng một query, nên cần bản `Q`. Hai bản định nghĩa được buộc vào nhau bằng test ở Step 1 chứ không phải bằng cách viết lại `is_open` thành truy vấn — làm vậy sẽ thêm một query vào bốn call site đang có (`assignments/views.py:98,124,143`, `submissions/services.py:39`).

- [ ] **Step 1: Viết test thất bại**

```python
# thêm vào cuối backend/classes/tests/test_classes.py
from datetime import timedelta

from django.utils import timezone

from classes.views import is_open, open_class_q


class OpenClassWindowTests(TestCase):
    """`is_open` (in-memory) và `open_class_q` (SQL) là hai cách viết cùng một
    luật §6.2. Test này là thứ duy nhất giữ chúng khớp nhau — đừng xoá."""

    def setUp(self):
        self.teacher = User.objects.create_user("window-teacher@example.test", "pw", role="TEACHER")
        now = timezone.now()
        make = lambda name, starts, ends, active: Class.objects.create(
            teacher=self.teacher, name=name, starts_at=starts, ends_at=ends, is_active=active
        )
        self.running = make("running", now - timedelta(days=1), now + timedelta(days=1), True)
        self.scheduled = make("scheduled", now + timedelta(days=1), now + timedelta(days=2), True)
        self.ended = make("ended", now - timedelta(days=2), now - timedelta(days=1), True)
        self.disabled = make("disabled", now - timedelta(days=1), now + timedelta(days=1), False)

    def test_the_query_selects_exactly_the_classes_is_open_accepts(self):
        by_query = set(Class.objects.filter(open_class_q()).values_list("id", flat=True))
        by_instance = {c.id for c in Class.objects.all() if is_open(c)}

        self.assertEqual(by_query, by_instance)
        self.assertEqual(by_query, {self.running.id})

    def test_the_query_accepts_an_explicit_now(self):
        before_start = self.scheduled.starts_at + timedelta(hours=1)

        selected = set(Class.objects.filter(open_class_q(before_start)).values_list("id", flat=True))

        self.assertIn(self.scheduled.id, selected)
        self.assertNotIn(self.ended.id, selected)
```

> `User` và `Class` đã được import ở đầu `test_classes.py`; chỉ thêm `timedelta`, `timezone`, `is_open`, `open_class_q` nếu chúng chưa có ở đó.

- [ ] **Step 2: Chạy để xác nhận đỏ**

Run: `cd backend && python manage.py test classes.tests.test_classes.OpenClassWindowTests -v 2`
Expected: FAIL — `ImportError: cannot import name 'open_class_q'`

- [ ] **Step 3: Cài đặt**

```python
# backend/classes/views.py, ngay dưới def is_open(...)
def open_class_q(now=None):
    """Bản `WHERE` của `is_open`. Hai hàm phải luôn đồng ý với nhau —
    xem `OpenClassWindowTests`."""
    now = now or timezone.now()
    return Q(is_active=True, starts_at__lte=now, ends_at__gt=now)
```

Kiểm tra đầu file `classes/views.py` đã có `from django.db.models import Q` chưa; nếu chưa, thêm `Q` vào dòng import sẵn có của `django.db.models`.

- [ ] **Step 4: Chạy để xác nhận xanh**

Run: `cd backend && python manage.py test classes -v 2`
Expected: PASS toàn bộ app `classes` (không chỉ test mới — `Q` được thêm vào import chung).

- [ ] **Step 5: Commit**

```bash
git add backend/classes/views.py backend/classes/tests/test_classes.py
git commit -m "feat(classes): expose the open-class window as a query filter"
```

---

### Task 2: Khung app `dashboard` và endpoint trả role

**Files:**
- Create: `backend/dashboard/__init__.py`, `backend/dashboard/views.py`, `backend/dashboard/urls.py`, `backend/dashboard/tests/__init__.py`, `backend/dashboard/tests/test_dashboard.py`
- Modify: `backend/config/settings.py:11-26`, `backend/config/urls.py`

**Interfaces:**
- Consumes: `accounts.permissions.IsAuthenticated`.
- Produces: `GET /api/dashboard` trả `{"role": "<ADMIN|TEACHER|STUDENT>"}`; `dashboard.views.DashboardView`. Task 3–7 thay phần thân của response, không đụng phần quyền.

Task này chốt quyền và định tuyến trước, để các task sau chỉ còn lo truy vấn. Không tạo `models.py`, không tạo `migrations/` — app này không sở hữu bảng nào; nếu `makemigrations` sinh ra gì cho nó thì có người đã thêm model vào sai chỗ.

- [ ] **Step 1: Viết test thất bại**

```python
# backend/dashboard/tests/test_dashboard.py
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User


class DashboardAccessTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user("dash-admin@example.test", "pw", role="ADMIN")
        self.teacher = User.objects.create_user("dash-teacher@example.test", "pw", role="TEACHER")
        self.student = User.objects.create_user("dash-student@example.test", "pw", role="STUDENT")

    def test_anonymous_is_rejected(self):
        self.assertEqual(self.client.get("/api/dashboard").status_code, 401)

    def test_each_role_gets_its_own_shape_marker(self):
        for user, role in ((self.admin, "ADMIN"), (self.teacher, "TEACHER"), (self.student, "STUDENT")):
            self.client.force_authenticate(user)
            response = self.client.get("/api/dashboard")

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["role"], role)

    def test_a_forced_password_change_blocks_the_dashboard(self):
        self.student.must_change_password = True
        self.student.save()
        self.client.force_authenticate(self.student)

        self.assertEqual(self.client.get("/api/dashboard").status_code, 403)

    def test_the_payload_shape_is_not_selectable_by_query_param(self):
        """Một Teacher không được xin payload của Admin."""
        self.client.force_authenticate(self.teacher)

        response = self.client.get("/api/dashboard?role=ADMIN")

        self.assertEqual(response.data["role"], "TEACHER")
```

- [ ] **Step 2: Chạy để xác nhận đỏ**

Run: `cd backend && python manage.py test dashboard -v 2`
Expected: FAIL — app `dashboard` chưa tồn tại (`ModuleNotFoundError`).

- [ ] **Step 3: Cài đặt**

```python
# backend/dashboard/__init__.py  — file rỗng
```

```python
# backend/dashboard/views.py
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAuthenticated


class DashboardView(APIView):
    """Một endpoint, ba hình payload. Role đọc từ `request.user`, không bao giờ
    từ query param — payload là thứ người gọi *được phép* thấy, không phải thứ
    họ xin."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"role": request.user.role})
```

```python
# backend/dashboard/urls.py
from django.urls import path

from .views import DashboardView


urlpatterns = [path("dashboard", DashboardView.as_view())]
```

```python
# backend/dashboard/tests/__init__.py  — file rỗng
```

`backend/config/settings.py` — thêm `"dashboard",` vào cuối `INSTALLED_APPS`, sau `"notifications",`.

`backend/config/urls.py` — thêm `from dashboard import urls as dashboard_urls` cạnh các import khác, và `path("api/", include(dashboard_urls)),` vào `urlpatterns`.

- [ ] **Step 4: Chạy để xác nhận xanh**

Run: `cd backend && python manage.py test dashboard -v 2`
Expected: PASS 4 test.

Chạy thêm: `cd backend && python manage.py makemigrations --check --dry-run`
Expected: không có migration nào cần tạo.

- [ ] **Step 5: Commit**

```bash
git add backend/dashboard backend/config/settings.py backend/config/urls.py
git commit -m "feat(dashboard): add the role-shaped dashboard endpoint"
```

---

### Task 3: Payload Admin — số account

**Files:**
- Create: `backend/dashboard/services.py`, `backend/dashboard/serializers.py`
- Modify: `backend/dashboard/views.py`
- Test: `backend/dashboard/tests/test_dashboard.py`

**Interfaces:**
- Consumes: `accounts.models.User`.
- Produces: `dashboard.services.admin_dashboard(user) -> dict` với khoá `role`, `accounts`. Task 4 thêm khoá `classes`, Task 5 thêm `recent_audit` vào **cùng** dict này.

Account bị vô hiệu hoá (`is_active=False`) vẫn được đếm — nó vẫn tồn tại và vẫn cần quản lý. Chỉ soft-delete (`is_deleted=True`) mới biến mất khỏi con số.

- [ ] **Step 1: Viết test thất bại**

```python
# thêm vào backend/dashboard/tests/test_dashboard.py
class AdminAccountCountTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user("count-admin@example.test", "pw", role="ADMIN")
        User.objects.create_user("count-admin2@example.test", "pw", role="ADMIN")
        for i in range(3):
            User.objects.create_user(f"count-teacher{i}@example.test", "pw", role="TEACHER")
        for i in range(5):
            User.objects.create_user(f"count-student{i}@example.test", "pw", role="STUDENT")
        self.client.force_authenticate(self.admin)

    def test_counts_are_grouped_by_role(self):
        response = self.client.get("/api/dashboard")

        self.assertEqual(response.data["accounts"], {"admins": 2, "teachers": 3, "students": 5})

    def test_a_disabled_account_still_counts(self):
        User.objects.filter(email="count-student0@example.test").update(is_active=False)

        response = self.client.get("/api/dashboard")

        self.assertEqual(response.data["accounts"]["students"], 5)

    def test_a_soft_deleted_account_does_not_count(self):
        User.objects.filter(email="count-student0@example.test").update(is_deleted=True)

        response = self.client.get("/api/dashboard")

        self.assertEqual(response.data["accounts"]["students"], 4)

    def test_a_role_with_no_accounts_reports_zero_not_a_missing_key(self):
        User.objects.filter(role="TEACHER").update(is_deleted=True)

        response = self.client.get("/api/dashboard")

        self.assertEqual(response.data["accounts"]["teachers"], 0)
```

- [ ] **Step 2: Chạy để xác nhận đỏ**

Run: `cd backend && python manage.py test dashboard.tests.test_dashboard.AdminAccountCountTests -v 2`
Expected: FAIL — `KeyError: 'accounts'`.

- [ ] **Step 3: Cài đặt**

```python
# backend/dashboard/services.py
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
```

```python
# backend/dashboard/serializers.py
from rest_framework import serializers


class AccountCountsSerializer(serializers.Serializer):
    admins = serializers.IntegerField()
    teachers = serializers.IntegerField()
    students = serializers.IntegerField()


class AdminDashboardSerializer(serializers.Serializer):
    role = serializers.CharField()
    accounts = AccountCountsSerializer()
```

```python
# backend/dashboard/views.py — thay thân của get()
from accounts.models import User

from .serializers import AdminDashboardSerializer
from .services import admin_dashboard


class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role == User.Role.ADMIN:
            return Response(AdminDashboardSerializer(admin_dashboard(request.user)).data)
        return Response({"role": request.user.role})
```

- [ ] **Step 4: Chạy để xác nhận xanh**

Run: `cd backend && python manage.py test dashboard -v 2`
Expected: PASS toàn bộ, gồm cả `DashboardAccessTests` của Task 2.

- [ ] **Step 5: Commit**

```bash
git add backend/dashboard
git commit -m "feat(dashboard): count accounts by role for the admin dashboard"
```

---

### Task 4: Payload Admin — bốn nhóm lớp

**Files:**
- Modify: `backend/dashboard/services.py`, `backend/dashboard/serializers.py`
- Test: `backend/dashboard/tests/test_dashboard.py`

**Interfaces:**
- Consumes: `classes.views.open_class_q` (Task 1), `classes.models.Class`.
- Produces: khoá `classes` trong dict của `admin_dashboard`: `{"running", "scheduled", "ended", "disabled"}`.

Bốn nhóm **loại trừ lẫn nhau** và cộng lại bằng tổng số lớp. `disabled` xét trước và không quan tâm ngày tháng: một lớp đã tắt thì việc nó "đáng lẽ đang chạy" không còn ý nghĩa với ai.

- [ ] **Step 1: Viết test thất bại**

```python
# thêm vào backend/dashboard/tests/test_dashboard.py
from datetime import timedelta

from django.utils import timezone

from classes.models import Class


class AdminClassBucketTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user("bucket-admin@example.test", "pw", role="ADMIN")
        teacher = User.objects.create_user("bucket-teacher@example.test", "pw", role="TEACHER")
        now = timezone.now()
        make = lambda name, starts, ends, active: Class.objects.create(
            teacher=teacher, name=name, starts_at=starts, ends_at=ends, is_active=active
        )
        make("running-1", now - timedelta(days=1), now + timedelta(days=1), True)
        make("running-2", now - timedelta(days=3), now + timedelta(days=3), True)
        make("scheduled", now + timedelta(days=1), now + timedelta(days=5), True)
        make("ended-1", now - timedelta(days=9), now - timedelta(days=2), True)
        make("ended-2", now - timedelta(days=8), now - timedelta(days=1), True)
        make("ended-3", now - timedelta(days=7), now - timedelta(hours=1), True)
        make("disabled", now - timedelta(days=1), now + timedelta(days=1), False)
        self.client.force_authenticate(self.admin)

    def test_classes_are_split_into_four_buckets(self):
        response = self.client.get("/api/dashboard")

        self.assertEqual(
            response.data["classes"],
            {"running": 2, "scheduled": 1, "ended": 3, "disabled": 1},
        )

    def test_the_buckets_partition_every_class(self):
        response = self.client.get("/api/dashboard")

        self.assertEqual(sum(response.data["classes"].values()), Class.objects.count())

    def test_a_disabled_class_is_never_counted_as_running(self):
        Class.objects.filter(name="running-1").update(is_active=False)

        response = self.client.get("/api/dashboard")

        self.assertEqual(response.data["classes"]["running"], 1)
        self.assertEqual(response.data["classes"]["disabled"], 2)
```

- [ ] **Step 2: Chạy để xác nhận đỏ**

Run: `cd backend && python manage.py test dashboard.tests.test_dashboard.AdminClassBucketTests -v 2`
Expected: FAIL — `KeyError: 'classes'`.

- [ ] **Step 3: Cài đặt**

```python
# backend/dashboard/services.py — thêm import
from django.db.models import Count, Q
from django.utils import timezone

from classes.models import Class
from classes.views import open_class_q
```

```python
# backend/dashboard/services.py — thêm hàm
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
```

```python
# backend/dashboard/services.py — sửa admin_dashboard
def admin_dashboard(user):
    now = timezone.now()
    return {
        "role": User.Role.ADMIN,
        "accounts": _account_counts(),
        "classes": _class_buckets(now),
    }
```

```python
# backend/dashboard/serializers.py — thêm và nối vào AdminDashboardSerializer
class ClassBucketsSerializer(serializers.Serializer):
    running = serializers.IntegerField()
    scheduled = serializers.IntegerField()
    ended = serializers.IntegerField()
    disabled = serializers.IntegerField()


class AdminDashboardSerializer(serializers.Serializer):
    role = serializers.CharField()
    accounts = AccountCountsSerializer()
    classes = ClassBucketsSerializer()
```

- [ ] **Step 4: Chạy để xác nhận xanh**

Run: `cd backend && python manage.py test dashboard -v 2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/dashboard
git commit -m "feat(dashboard): split classes into running, scheduled, ended and disabled"
```

---

### Task 5: Payload Admin — 5 dòng audit gần nhất

> **CHẶN:** Task này cần `audit/labels.py::resolve_labels` từ `docs/plans/08-audit-log-plan.md` (Task 3 của plan đó). Nếu module chưa tồn tại, **dừng lại và chạy plan 08 trước**, đừng viết bản `resolve_labels` thứ hai.

**Files:**
- Modify: `backend/dashboard/services.py`, `backend/dashboard/serializers.py`
- Test: `backend/dashboard/tests/test_dashboard.py`

**Interfaces:**
- Consumes: `audit.models.AuditLog`, `audit.labels.resolve_labels(logs) -> dict[int, str]`.
- Produces: khoá `recent_audit` — danh sách dict `{id, action, target_label, actor: {id, full_name, role}, created_at}`.

Trả `action` thô kèm `target_label` đã phân giải; frontend dựng câu bằng `lib/auditActions.ts` của plan 08, và giữ nguyên đường lui in mã dotted khi gặp action lạ. Thứ tự `(-created_at, -id)` giống hệt `/api/audit-logs` — hai màn hình đọc cùng bảng phải kể cùng một câu chuyện.

- [ ] **Step 1: Viết test thất bại**

```python
# thêm vào backend/dashboard/tests/test_dashboard.py
from audit.models import AuditLog


class AdminRecentAuditTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user("audit-admin@example.test", "pw", role="ADMIN")
        teacher = User.objects.create_user("audit-teacher@example.test", "pw", role="TEACHER")
        teacher.full_name = "Pham Thu Hoa"
        teacher.save()
        self.teacher = teacher
        self.logs = [
            AuditLog.objects.create(
                actor=self.admin, action="account.created",
                target_type="accounts.user", target_id=teacher.id, metadata={},
            )
            for _ in range(7)
        ]
        self.client.force_authenticate(self.admin)

    def test_only_the_five_newest_rows_come_back(self):
        response = self.client.get("/api/dashboard")

        self.assertEqual(len(response.data["recent_audit"]), 5)
        self.assertEqual(
            [row["id"] for row in response.data["recent_audit"]],
            [log.id for log in reversed(self.logs)][:5],
        )

    def test_a_row_carries_the_actor_and_the_resolved_target(self):
        row = self.client.get("/api/dashboard").data["recent_audit"][0]

        self.assertEqual(row["action"], "account.created")
        self.assertEqual(row["target_label"], "Pham Thu Hoa")
        self.assertEqual(row["actor"]["id"], self.admin.id)
        self.assertEqual(row["actor"]["role"], "ADMIN")


class AdminEmptyAuditTests(TestCase):
    """`AuditLog` là append-only — `.delete()` raise `RuntimeError` (08 §4), nên
    danh sách rỗng chỉ dựng được trong một TestCase không ghi log nào."""

    def test_an_empty_log_yields_an_empty_list_not_a_missing_key(self):
        client = APIClient()
        admin = User.objects.create_user("empty-audit@example.test", "pw", role="ADMIN")
        client.force_authenticate(admin)

        response = client.get("/api/dashboard")

        self.assertEqual(response.data["recent_audit"], [])
```

- [ ] **Step 2: Chạy để xác nhận đỏ**

Run: `cd backend && python manage.py test dashboard.tests.test_dashboard.AdminRecentAuditTests -v 2`
Expected: FAIL — `KeyError: 'recent_audit'`.

- [ ] **Step 3: Cài đặt**

```python
# backend/dashboard/services.py — thêm import
from audit.labels import resolve_labels
from audit.models import AuditLog
```

```python
# backend/dashboard/services.py — thêm hàm
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
```

> `AuditLog.Meta.ordering = ("-created_at", "-id")` nên không cần `.order_by()` — thứ tự đã đúng và giống `/api/audit-logs`.

```python
# backend/dashboard/services.py — sửa admin_dashboard
def admin_dashboard(user):
    now = timezone.now()
    return {
        "role": User.Role.ADMIN,
        "accounts": _account_counts(),
        "classes": _class_buckets(now),
        "recent_audit": _recent_audit(),
    }
```

```python
# backend/dashboard/serializers.py — thêm và nối vào AdminDashboardSerializer
class AuditActorSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField(allow_null=True)
    role = serializers.CharField()


class RecentAuditSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    action = serializers.CharField()
    target_label = serializers.CharField(allow_blank=True)
    actor = AuditActorSerializer()
    created_at = serializers.DateTimeField()


class AdminDashboardSerializer(serializers.Serializer):
    role = serializers.CharField()
    accounts = AccountCountsSerializer()
    classes = ClassBucketsSerializer()
    recent_audit = RecentAuditSerializer(many=True)
```

- [ ] **Step 4: Chạy để xác nhận xanh**

Run: `cd backend && python manage.py test dashboard audit -v 2`
Expected: PASS cả hai app.

- [ ] **Step 5: Commit**

```bash
git add backend/dashboard
git commit -m "feat(dashboard): show the five newest audit rows to an admin"
```

---

### Task 6: Payload Teacher — năm thẻ số

**Files:**
- Modify: `backend/dashboard/services.py`, `backend/dashboard/serializers.py`, `backend/dashboard/views.py`
- Test: `backend/dashboard/tests/test_dashboard.py`

**Interfaces:**
- Consumes: `classes.views.scoped_classes`, `classes.views.open_class_q`, `classes.models.Enrollment`, `assignments.models.Assignment`, `assignments.models.AssignmentGrade`, `submissions.models.Submission`.
- Produces: `dashboard.services.teacher_dashboard(user) -> dict` với `role` + `cards: {my_classes, running_classes, open_assignments, pending_grading, students}`. Task 7 thêm `pending` và `due_soon` vào cùng dict.

Hai chỗ dễ sai: `students` đếm **distinct** người (một người học hai lớp của cùng teacher là một người, không phải hai), và `pending_grading` đếm **cặp (assignment, student)** chứ không đếm bản nộp — một học viên nộp lại ba lần vẫn là một việc phải làm.

- [ ] **Step 1: Viết test thất bại**

```python
# thêm vào backend/dashboard/tests/test_dashboard.py
from assignments.models import Assignment, AssignmentGrade
from classes.models import Enrollment
from submissions.models import Submission


def make_submission(assignment, student, version=1):
    return Submission.objects.create(
        assignment=assignment, student=student, version=version,
        file_path=f"x/{assignment.id}-{student.id}-{version}.pdf",
        original_filename="work.pdf", content_type="application/pdf", size=10,
    )


class TeacherCardTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        now = timezone.now()
        self.teacher = User.objects.create_user("cards-teacher@example.test", "pw", role="TEACHER")
        self.other = User.objects.create_user("cards-other@example.test", "pw", role="TEACHER")
        self.running = Class.objects.create(
            teacher=self.teacher, name="running", starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=5), is_active=True,
        )
        self.ended = Class.objects.create(
            teacher=self.teacher, name="ended", starts_at=now - timedelta(days=9),
            ends_at=now - timedelta(days=1), is_active=True,
        )
        self.foreign = Class.objects.create(
            teacher=self.other, name="foreign", starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=5), is_active=True,
        )
        self.students = [
            User.objects.create_user(f"cards-student{i}@example.test", "pw", role="STUDENT")
            for i in range(3)
        ]
        for student in self.students:
            Enrollment.objects.create(classroom=self.running, student=student)
        # Cùng một người, học thêm lớp thứ hai của chính teacher này.
        Enrollment.objects.create(classroom=self.ended, student=self.students[0])
        Enrollment.objects.create(classroom=self.foreign, student=self.students[0])

        self.open_assignment = Assignment.objects.create(
            classroom=self.running, title="Lab 1", description="d", due_at=now + timedelta(days=2),
        )
        Assignment.objects.create(
            classroom=self.running, title="Lab 0", description="d", due_at=now - timedelta(days=1),
        )
        Assignment.objects.create(
            classroom=self.ended, title="Old lab", description="d", due_at=now + timedelta(days=2),
        )
        self.client.force_authenticate(self.teacher)

    def test_class_cards_count_only_my_classes(self):
        cards = self.client.get("/api/dashboard").data["cards"]

        self.assertEqual(cards["my_classes"], 2)
        self.assertEqual(cards["running_classes"], 1)

    def test_open_assignments_need_both_an_open_class_and_a_future_due_date(self):
        cards = self.client.get("/api/dashboard").data["cards"]

        self.assertEqual(cards["open_assignments"], 1)

    def test_students_are_counted_once_across_my_classes(self):
        cards = self.client.get("/api/dashboard").data["cards"]

        self.assertEqual(cards["students"], 3)

    def test_pending_grading_counts_pairs_not_versions(self):
        for version in (1, 2, 3):
            make_submission(self.open_assignment, self.students[0], version)
        make_submission(self.open_assignment, self.students[1])

        cards = self.client.get("/api/dashboard").data["cards"]

        self.assertEqual(cards["pending_grading"], 2)

    def test_a_graded_pair_stops_being_pending(self):
        make_submission(self.open_assignment, self.students[0])
        make_submission(self.open_assignment, self.students[1])
        AssignmentGrade.objects.create(
            assignment=self.open_assignment, student=self.students[0], score=85,
        )

        cards = self.client.get("/api/dashboard").data["cards"]

        self.assertEqual(cards["pending_grading"], 1)

    def test_a_disabled_class_vanishes_from_every_teacher_number(self):
        """Lớp `is_active=False` vô hình với Teacher hoàn toàn (§6.2), không phải
        chỉ read-only — kể cả bài chờ chấm nằm trong đó."""
        make_submission(self.open_assignment, self.students[0])
        Class.objects.filter(id=self.running.id).update(is_active=False)

        cards = self.client.get("/api/dashboard").data["cards"]

        self.assertEqual(cards["my_classes"], 1)
        self.assertEqual(cards["running_classes"], 0)
        self.assertEqual(cards["open_assignments"], 0)
        self.assertEqual(cards["pending_grading"], 0)

    def test_another_teachers_submissions_are_invisible(self):
        foreign_assignment = Assignment.objects.create(
            classroom=self.foreign, title="Foreign lab", description="d",
            due_at=timezone.now() + timedelta(days=2),
        )
        make_submission(foreign_assignment, self.students[0])

        cards = self.client.get("/api/dashboard").data["cards"]

        self.assertEqual(cards["pending_grading"], 0)
```

- [ ] **Step 2: Chạy để xác nhận đỏ**

Run: `cd backend && python manage.py test dashboard.tests.test_dashboard.TeacherCardTests -v 2`
Expected: FAIL — `KeyError: 'cards'`.

- [ ] **Step 3: Cài đặt**

```python
# backend/dashboard/services.py — thêm import
from django.db.models import Exists, OuterRef

from assignments.models import Assignment, AssignmentGrade
from classes.models import Enrollment
from classes.views import scoped_classes
from submissions.models import Submission
```

```python
# backend/dashboard/services.py — thêm hàm
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
```

```python
# backend/dashboard/serializers.py — thêm
class TeacherCardsSerializer(serializers.Serializer):
    my_classes = serializers.IntegerField()
    running_classes = serializers.IntegerField()
    open_assignments = serializers.IntegerField()
    pending_grading = serializers.IntegerField()
    students = serializers.IntegerField()


class TeacherDashboardSerializer(serializers.Serializer):
    role = serializers.CharField()
    cards = TeacherCardsSerializer()
```

```python
# backend/dashboard/views.py — thêm nhánh
from .serializers import AdminDashboardSerializer, TeacherDashboardSerializer
from .services import admin_dashboard, teacher_dashboard

        if request.user.role == User.Role.TEACHER:
            return Response(TeacherDashboardSerializer(teacher_dashboard(request.user)).data)
```

- [ ] **Step 4: Chạy để xác nhận xanh**

Run: `cd backend && python manage.py test dashboard -v 2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/dashboard
git commit -m "feat(dashboard): count a teacher's classes, students and grading backlog"
```

---

### Task 7: Payload Teacher — danh sách chờ chấm và sắp tới hạn

**Files:**
- Modify: `backend/dashboard/services.py`, `backend/dashboard/serializers.py`
- Test: `backend/dashboard/tests/test_dashboard.py`

**Interfaces:**
- Consumes: `_ungraded_submissions(class_ids)` (Task 6).
- Produces: khoá `pending` (≤10) và `due_soon` (≤5) trong dict của `teacher_dashboard`.

`pending` chỉ lấy **bản nộp mới nhất** của mỗi cặp — teacher chỉ bao giờ chấm bản mới nhất (04 §1), nên hiện bản cũ ở đây là mời người ta bấm nhầm.

- [ ] **Step 1: Viết test thất bại**

```python
# thêm vào backend/dashboard/tests/test_dashboard.py
class TeacherListTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        now = timezone.now()
        self.teacher = User.objects.create_user("list-teacher@example.test", "pw", role="TEACHER")
        self.classroom = Class.objects.create(
            teacher=self.teacher, name="Web Development K18A",
            starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=30), is_active=True,
        )
        self.students = [
            User.objects.create_user(f"list-student{i}@example.test", "pw", role="STUDENT",
                                     full_name=f"Student {i}")
            for i in range(2)
        ]
        for student in self.students:
            Enrollment.objects.create(classroom=self.classroom, student=student)
        self.assignment = Assignment.objects.create(
            classroom=self.classroom, title="Lab 3", description="d", due_at=now + timedelta(days=3),
        )
        self.client.force_authenticate(self.teacher)

    def test_pending_shows_the_latest_version_of_each_pair(self):
        make_submission(self.assignment, self.students[0], version=1)
        latest = make_submission(self.assignment, self.students[0], version=2)

        pending = self.client.get("/api/dashboard").data["pending"]

        self.assertEqual([row["submission_id"] for row in pending], [latest.id])

    def test_a_pending_row_carries_the_names_the_screen_shows(self):
        make_submission(self.assignment, self.students[0])

        row = self.client.get("/api/dashboard").data["pending"][0]

        self.assertEqual(row["assignment_id"], self.assignment.id)
        self.assertEqual(row["assignment_title"], "Lab 3")
        self.assertEqual(row["class_id"], self.classroom.id)
        self.assertEqual(row["class_name"], "Web Development K18A")
        self.assertEqual(row["student"]["id"], self.students[0].id)
        self.assertEqual(row["student"]["full_name"], "Student 0")

    def test_pending_is_newest_first_and_capped_at_ten(self):
        extra = [
            User.objects.create_user(f"list-extra{i}@example.test", "pw", role="STUDENT")
            for i in range(12)
        ]
        for student in extra:
            Enrollment.objects.create(classroom=self.classroom, student=student)
            make_submission(self.assignment, student)

        pending = self.client.get("/api/dashboard").data["pending"]

        self.assertEqual(len(pending), 10)
        self.assertEqual(pending[0]["student"]["id"], extra[-1].id)

    def test_a_graded_pair_leaves_the_pending_list(self):
        make_submission(self.assignment, self.students[0])
        AssignmentGrade.objects.create(assignment=self.assignment, student=self.students[0], score=90)

        self.assertEqual(self.client.get("/api/dashboard").data["pending"], [])

    def test_due_soon_carries_the_two_numbers_that_make_the_row_worth_reading(self):
        make_submission(self.assignment, self.students[0], version=1)
        make_submission(self.assignment, self.students[0], version=2)

        row = self.client.get("/api/dashboard").data["due_soon"][0]

        self.assertEqual(row["assignment_id"], self.assignment.id)
        self.assertEqual(row["submitted_count"], 1)
        self.assertEqual(row["student_count"], 2)

    def test_due_soon_ignores_anything_further_out_than_a_week(self):
        Assignment.objects.create(
            classroom=self.classroom, title="Far away", description="d",
            due_at=timezone.now() + timedelta(days=20),
        )

        due_soon = self.client.get("/api/dashboard").data["due_soon"]

        self.assertEqual([row["assignment_id"] for row in due_soon], [self.assignment.id])
```

- [ ] **Step 2: Chạy để xác nhận đỏ**

Run: `cd backend && python manage.py test dashboard.tests.test_dashboard.TeacherListTests -v 2`
Expected: FAIL — `KeyError: 'pending'`.

- [ ] **Step 3: Cài đặt**

```python
# backend/dashboard/services.py — thêm import
from datetime import timedelta

from django.db.models import Count, F, Q, Subquery
```

```python
# backend/dashboard/services.py — thêm hàm
_PENDING_LIMIT = 10
_DUE_SOON_LIMIT = 5
_DUE_SOON_WINDOW = timedelta(days=7)


def _pending_rows(class_ids):
    """Chỉ bản nộp mới nhất của mỗi cặp: teacher chỉ chấm bản mới nhất (04 §1),
    nên hiện bản cũ ở đây là mời người ta bấm nhầm."""
    latest = (
        Submission.objects.filter(
            assignment_id=OuterRef("assignment_id"), student_id=OuterRef("student_id")
        )
        .order_by("-version")
        .values("id")[:1]
    )
    rows = (
        _ungraded_submissions(class_ids)
        .annotate(latest_id=Subquery(latest))
        .filter(id=F("latest_id"))
        .select_related("assignment", "assignment__classroom", "student")
        .order_by("-created_at", "-id")[:_PENDING_LIMIT]
    )
    return [
        {
            "submission_id": row.id,
            "assignment_id": row.assignment_id,
            "assignment_title": row.assignment.title,
            "class_id": row.assignment.classroom_id,
            "class_name": row.assignment.classroom.name,
            "student": {"id": row.student_id, "full_name": row.student.full_name},
            "submitted_at": row.created_at,
        }
        for row in rows
    ]


def _due_soon_rows(open_ids, now):
    rows = (
        Assignment.objects.filter(
            classroom_id__in=open_ids, due_at__gt=now, due_at__lte=now + _DUE_SOON_WINDOW
        )
        .select_related("classroom")
        .annotate(
            submitted_count=Count("submissions__student", distinct=True),
            student_count=Count("classroom__enrollments__student", distinct=True),
        )
        .order_by("due_at", "id")[:_DUE_SOON_LIMIT]
    )
    return [
        {
            "assignment_id": row.id,
            "title": row.title,
            "class_id": row.classroom_id,
            "class_name": row.classroom.name,
            "due_at": row.due_at,
            "submitted_count": row.submitted_count,
            "student_count": row.student_count,
        }
        for row in rows
    ]
```

> `distinct=True` trên cả hai `Count` là bắt buộc: hai `JOIN` trong cùng một query nhân bản dòng của nhau, và không có `distinct` thì `submitted_count` sẽ bằng số bản nộp × sĩ số.

```python
# backend/dashboard/services.py — sửa teacher_dashboard, thay dòng return cuối
    return {
        "role": User.Role.TEACHER,
        "cards": cards,
        "pending": _pending_rows(class_ids),
        "due_soon": _due_soon_rows(open_ids, now),
    }
```

```python
# backend/dashboard/serializers.py — thêm và nối vào TeacherDashboardSerializer
class StudentRefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField(allow_null=True)


class PendingRowSerializer(serializers.Serializer):
    submission_id = serializers.IntegerField()
    assignment_id = serializers.IntegerField()
    assignment_title = serializers.CharField()
    class_id = serializers.IntegerField()
    class_name = serializers.CharField()
    student = StudentRefSerializer()
    submitted_at = serializers.DateTimeField()


class DueSoonRowSerializer(serializers.Serializer):
    assignment_id = serializers.IntegerField()
    title = serializers.CharField()
    class_id = serializers.IntegerField()
    class_name = serializers.CharField()
    due_at = serializers.DateTimeField()
    submitted_count = serializers.IntegerField()
    student_count = serializers.IntegerField()


class TeacherDashboardSerializer(serializers.Serializer):
    role = serializers.CharField()
    cards = TeacherCardsSerializer()
    pending = PendingRowSerializer(many=True)
    due_soon = DueSoonRowSerializer(many=True)
```

- [ ] **Step 4: Chạy để xác nhận xanh**

Run: `cd backend && python manage.py test dashboard -v 2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/dashboard
git commit -m "feat(dashboard): list a teacher's grading backlog and upcoming deadlines"
```

---

### Task 8: Payload Student

**Files:**
- Modify: `backend/dashboard/services.py`, `backend/dashboard/serializers.py`, `backend/dashboard/views.py`
- Test: `backend/dashboard/tests/test_dashboard.py`

**Interfaces:**
- Consumes: `classes.views.scoped_classes`, `classes.views.open_class_q`, `grading.models.Grade`, `assignments.models.AssignmentGrade`.
- Produces: `dashboard.services.student_dashboard(user) -> dict` với `role`, `cards: {my_classes, not_submitted, graded, average_score}`, `todo` (≤10), `recent_grades` (≤5).

Bài **quá hạn không vào** `not_submitted` lẫn `todo`: không còn hành động nào làm được với nó, và một thẻ "chưa nộp" không bao giờ về 0 là thẻ không ai đọc nữa. Trạng thái quá hạn vẫn hiện trong tab lớp sẵn có.

- [ ] **Step 1: Viết test thất bại**

```python
# thêm vào backend/dashboard/tests/test_dashboard.py
from grading.models import Grade


class StudentDashboardTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        now = timezone.now()
        self.teacher = User.objects.create_user("stu-teacher@example.test", "pw", role="TEACHER")
        self.student = User.objects.create_user("stu-student@example.test", "pw", role="STUDENT")
        self.outsider = User.objects.create_user("stu-outsider@example.test", "pw", role="STUDENT")
        self.classroom = Class.objects.create(
            teacher=self.teacher, name="Web Development K18A",
            starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=30), is_active=True,
        )
        self.foreign = Class.objects.create(
            teacher=self.teacher, name="Not mine",
            starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=30), is_active=True,
        )
        Enrollment.objects.create(classroom=self.classroom, student=self.student)
        Enrollment.objects.create(classroom=self.foreign, student=self.outsider)
        self.soon = Assignment.objects.create(
            classroom=self.classroom, title="Lab 4", description="d", due_at=now + timedelta(days=2),
        )
        self.later = Assignment.objects.create(
            classroom=self.classroom, title="Lab 5", description="d", due_at=now + timedelta(days=9),
        )
        self.overdue = Assignment.objects.create(
            classroom=self.classroom, title="Lab 1", description="d", due_at=now - timedelta(days=1),
        )
        Assignment.objects.create(
            classroom=self.foreign, title="Foreign lab", description="d", due_at=now + timedelta(days=2),
        )
        self.client.force_authenticate(self.student)

    def test_only_my_open_unsubmitted_assignments_are_counted(self):
        data = self.client.get("/api/dashboard").data

        self.assertEqual(data["cards"]["my_classes"], 1)
        self.assertEqual(data["cards"]["not_submitted"], 2)

    def test_todo_is_due_date_ascending_and_excludes_overdue_work(self):
        todo = self.client.get("/api/dashboard").data["todo"]

        self.assertEqual([row["assignment_id"] for row in todo], [self.soon.id, self.later.id])
        self.assertEqual(todo[0]["class_name"], "Web Development K18A")

    def test_a_submitted_assignment_leaves_the_todo_list(self):
        make_submission(self.soon, self.student)

        data = self.client.get("/api/dashboard").data

        self.assertEqual(data["cards"]["not_submitted"], 1)
        self.assertEqual([row["assignment_id"] for row in data["todo"]], [self.later.id])

    def test_average_is_null_when_nothing_is_graded_yet(self):
        data = self.client.get("/api/dashboard").data

        self.assertEqual(data["cards"]["graded"], 0)
        self.assertIsNone(data["cards"]["average_score"])

    def test_average_is_rounded_to_one_decimal(self):
        AssignmentGrade.objects.create(assignment=self.soon, student=self.student, score=80)
        AssignmentGrade.objects.create(assignment=self.later, student=self.student, score=85)

        cards = self.client.get("/api/dashboard").data["cards"]

        self.assertEqual(cards["graded"], 2)
        self.assertEqual(cards["average_score"], 82.5)

    def test_recent_grades_are_newest_first(self):
        submission = make_submission(self.overdue, self.student)
        grade = Grade.objects.create(
            assignment=self.overdue, student=self.student, teacher=self.teacher,
            submission=submission, total_score=77, feedback="ok",
        )

        row = self.client.get("/api/dashboard").data["recent_grades"][0]

        self.assertEqual(row["assignment_id"], self.overdue.id)
        self.assertEqual(row["title"], "Lab 1")
        self.assertEqual(row["score"], 77)
        self.assertEqual(row["maximum_score"], 100)
        self.assertEqual(row["class_name"], "Web Development K18A")
        self.assertEqual(row["graded_at"], grade.created_at)

    def test_a_class_i_am_not_enrolled_in_is_invisible(self):
        todo_titles = [row["title"] for row in self.client.get("/api/dashboard").data["todo"]]

        self.assertNotIn("Foreign lab", todo_titles)

    def test_a_disabled_class_takes_its_assignments_with_it(self):
        Class.objects.filter(id=self.classroom.id).update(is_active=False)

        data = self.client.get("/api/dashboard").data

        self.assertEqual(data["cards"]["my_classes"], 0)
        self.assertEqual(data["cards"]["not_submitted"], 0)
        self.assertEqual(data["todo"], [])
```

- [ ] **Step 2: Chạy để xác nhận đỏ**

Run: `cd backend && python manage.py test dashboard.tests.test_dashboard.StudentDashboardTests -v 2`
Expected: FAIL — `KeyError: 'cards'` (payload Student còn là `{"role": ...}` trần).

- [ ] **Step 3: Cài đặt**

```python
# backend/dashboard/services.py — thêm import
from django.db.models import Avg

from grading.models import Grade
```

```python
# backend/dashboard/services.py — thêm hàm
_TODO_LIMIT = 10
_RECENT_GRADES_LIMIT = 5


def student_dashboard(user):
    now = timezone.now()
    classes = scoped_classes(user)
    open_ids = list(classes.filter(open_class_q(now)).values_list("id", flat=True))

    mine = Submission.objects.filter(assignment_id=OuterRef("pk"), student=user)
    # Bài quá hạn bị loại: không còn hành động nào làm được với nó, và một thẻ
    # "chưa nộp" không bao giờ về 0 là thẻ không ai đọc nữa.
    todo_qs = (
        Assignment.objects.filter(classroom_id__in=open_ids, due_at__gt=now)
        .annotate(submitted=Exists(mine))
        .filter(submitted=False)
        .select_related("classroom")
        .order_by("due_at", "id")
    )
    scores = AssignmentGrade.objects.filter(student=user).aggregate(
        graded=Count("id"), average=Avg("score")
    )
    recent = (
        Grade.objects.filter(student=user)
        .select_related("assignment", "assignment__classroom")
        .order_by("-created_at", "-id")[:_RECENT_GRADES_LIMIT]
    )

    return {
        "role": User.Role.STUDENT,
        "cards": {
            "my_classes": classes.count(),
            "not_submitted": todo_qs.count(),
            "graded": scores["graded"],
            # None khi chưa có điểm nào — frontend hiện "—", không hiện 0.
            "average_score": None if scores["average"] is None else round(scores["average"], 1),
        },
        "todo": [
            {
                "assignment_id": row.id,
                "title": row.title,
                "class_id": row.classroom_id,
                "class_name": row.classroom.name,
                "due_at": row.due_at,
            }
            for row in todo_qs[:_TODO_LIMIT]
        ],
        "recent_grades": [
            {
                "assignment_id": row.assignment_id,
                "title": row.assignment.title,
                "class_id": row.assignment.classroom_id,
                "class_name": row.assignment.classroom.name,
                "score": row.total_score,
                "maximum_score": row.assignment.maximum_score,
                "graded_at": row.created_at,
            }
            for row in recent
        ],
    }
```

```python
# backend/dashboard/serializers.py — thêm
class StudentCardsSerializer(serializers.Serializer):
    my_classes = serializers.IntegerField()
    not_submitted = serializers.IntegerField()
    graded = serializers.IntegerField()
    average_score = serializers.FloatField(allow_null=True)


class TodoRowSerializer(serializers.Serializer):
    assignment_id = serializers.IntegerField()
    title = serializers.CharField()
    class_id = serializers.IntegerField()
    class_name = serializers.CharField()
    due_at = serializers.DateTimeField()


class RecentGradeSerializer(serializers.Serializer):
    assignment_id = serializers.IntegerField()
    title = serializers.CharField()
    class_id = serializers.IntegerField()
    class_name = serializers.CharField()
    score = serializers.IntegerField()
    maximum_score = serializers.IntegerField()
    graded_at = serializers.DateTimeField()


class StudentDashboardSerializer(serializers.Serializer):
    role = serializers.CharField()
    cards = StudentCardsSerializer()
    todo = TodoRowSerializer(many=True)
    recent_grades = RecentGradeSerializer(many=True)
```

```python
# backend/dashboard/views.py — thay toàn bộ get() bằng bản cuối
from accounts.models import User
from accounts.permissions import IsAuthenticated

from .serializers import AdminDashboardSerializer, StudentDashboardSerializer, TeacherDashboardSerializer
from .services import admin_dashboard, student_dashboard, teacher_dashboard

_BY_ROLE = {
    User.Role.ADMIN: (admin_dashboard, AdminDashboardSerializer),
    User.Role.TEACHER: (teacher_dashboard, TeacherDashboardSerializer),
    User.Role.STUDENT: (student_dashboard, StudentDashboardSerializer),
}


class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        build, serializer_class = _BY_ROLE[request.user.role]
        return Response(serializer_class(build(request.user)).data)
```

- [ ] **Step 4: Chạy để xác nhận xanh**

Run: `cd backend && python manage.py test dashboard -v 2`
Expected: PASS toàn bộ, gồm cả `DashboardAccessTests` của Task 2 (nó vẫn chỉ kiểm `role`).

- [ ] **Step 5: Commit**

```bash
git add backend/dashboard
git commit -m "feat(dashboard): give a student their to-do list and recent grades"
```

---

### Task 9: Ghim ngân sách truy vấn

**Files:**
- Test: `backend/dashboard/tests/test_dashboard.py`

**Interfaces:**
- Consumes: cả ba hàm `*_dashboard` đã xong.
- Produces: không có code sản phẩm mới — task này chỉ thêm test.

Ngân sách 8 query là thứ dễ mất nhất khi ai đó thêm một trường "chỉ một vòng lặp nhỏ thôi". Test này biến nó thành lỗi build. Con số phải **cố định theo số bản ghi**: test dựng hai bộ dữ liệu khác cỡ và khẳng định query count không đổi.

- [ ] **Step 1: Viết test thất bại**

```python
# thêm vào backend/dashboard/tests/test_dashboard.py
class QueryBudgetTests(TestCase):
    """Ngân sách ≤ 8 query, không phụ thuộc số bản ghi. Nếu test này đỏ vì
    con số tăng: tìm vòng lặp mới, đừng nới ngưỡng."""

    BUDGET = 8

    def setUp(self):
        self.client = APIClient()
        now = timezone.now()
        self.admin = User.objects.create_user("budget-admin@example.test", "pw", role="ADMIN")
        self.teacher = User.objects.create_user("budget-teacher@example.test", "pw", role="TEACHER")
        self.student = User.objects.create_user("budget-student@example.test", "pw", role="STUDENT")
        self.classroom = Class.objects.create(
            teacher=self.teacher, name="Budget", starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=30), is_active=True,
        )
        Enrollment.objects.create(classroom=self.classroom, student=self.student)
        self.assignment = Assignment.objects.create(
            classroom=self.classroom, title="Lab", description="d", due_at=now + timedelta(days=2),
        )
        make_submission(self.assignment, self.student)

    def _grow(self):
        """Thêm 10 lớp, 10 bài, 10 học viên, 10 bản nộp."""
        now = timezone.now()
        for i in range(10):
            classroom = Class.objects.create(
                teacher=self.teacher, name=f"Grow {i}", starts_at=now - timedelta(days=1),
                ends_at=now + timedelta(days=30), is_active=True,
            )
            student = User.objects.create_user(f"grow{i}@example.test", "pw", role="STUDENT")
            Enrollment.objects.create(classroom=classroom, student=student)
            Enrollment.objects.create(classroom=classroom, student=self.student)
            assignment = Assignment.objects.create(
                classroom=classroom, title=f"Lab {i}", description="d", due_at=now + timedelta(days=2),
            )
            make_submission(assignment, student)

    def test_each_role_stays_within_budget_and_does_not_grow_with_data(self):
        for user in (self.admin, self.teacher, self.student):
            self.client.force_authenticate(user)
            with CaptureQueriesContext(connection) as small:
                self.client.get("/api/dashboard")
            self._grow()
            with CaptureQueriesContext(connection) as large:
                self.client.get("/api/dashboard")

            self.assertLessEqual(len(small.captured_queries), self.BUDGET, msg=f"{user.role} over budget")
            self.assertEqual(
                len(small.captured_queries), len(large.captured_queries),
                msg=f"{user.role}: query count grew with the data",
            )
```

Thêm import ở đầu file test:

```python
from django.db import connection
from django.test.utils import CaptureQueriesContext
```

> Dùng `CaptureQueriesContext` chứ không `assertNumQueries`: test này cần **so sánh** hai con số (trước và sau khi dữ liệu lớn lên) chứ không phải khẳng định một con số cứng. Một `assertNumQueries(8)` sẽ pass ngay cả khi số query tăng theo dữ liệu, miễn là bộ dữ liệu test đủ nhỏ — đúng cái nó phải bắt thì nó bỏ lọt.

- [ ] **Step 2: Chạy để xác nhận đỏ (hoặc xanh có điều kiện)**

Run: `cd backend && python manage.py test dashboard.tests.test_dashboard.QueryBudgetTests -v 2`

Expected: nếu FAIL vì `over budget` hoặc `query count grew with the data`, đó là bug thật trong Task 3–8 — sửa truy vấn (thường là thiếu `select_related`, hoặc một vòng lặp gọi `.count()`), **đừng nới `BUDGET`**. Nếu PASS ngay, ghi lại con số thực tế vào comment đầu class rồi sang bước sau.

- [ ] **Step 3: Ghi con số thực vào plan-of-record**

Chạy `cd backend && python manage.py test dashboard.tests.test_dashboard.QueryBudgetTests -v 2` một lần nữa và ghi số query thật của mỗi role vào docstring của `QueryBudgetTests`, dạng `# admin=N, teacher=N, student=N tại 2026-08-03`. Người sau cần biết mình còn bao nhiêu chỗ trống.

- [ ] **Step 4: Chạy toàn bộ backend**

Run: `cd backend && python manage.py test`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add backend/dashboard/tests/test_dashboard.py
git commit -m "test(dashboard): pin the per-role query budget"
```

---

## Frontend

Chạy test: `cd frontend && npm test`. Kiểm kiểu: `cd frontend && npm run build`.

### Task 10: Kiểu payload và `StatCard`

**Files:**
- Modify: `frontend/src/types.ts`, `frontend/src/styles.css`
- Create: `frontend/src/components/StatCard.tsx`

**Interfaces:**
- Consumes: payload của Task 3–8.
- Produces: `DashboardData` (union phân biệt bằng `role`), `AdminDashboard`, `TeacherDashboard`, `StudentDashboard`, và `<StatCard label value tone? />`. Task 11–13 dùng đúng các tên này.

Union phân biệt bằng `role` là thứ khiến `if (data.role === "ADMIN")` thu hẹp kiểu ở ba view — không có nó, mỗi view sẽ phải ép kiểu và mất luôn tác dụng của TypeScript ở đúng chỗ nó có ích.

- [ ] **Step 1: Thêm kiểu**

```ts
// frontend/src/types.ts — thêm vào cuối
export interface AuditRow {
  id: number;
  action: string;
  target_label: string;
  actor: { id: number; full_name: string | null; role: Role };
  created_at: string;
}

export interface AdminDashboard {
  role: "ADMIN";
  accounts: { admins: number; teachers: number; students: number };
  classes: { running: number; scheduled: number; ended: number; disabled: number };
  recent_audit: AuditRow[];
}

export interface PendingRow {
  submission_id: number;
  assignment_id: number;
  assignment_title: string;
  class_id: number;
  class_name: string;
  student: { id: number; full_name: string | null };
  submitted_at: string;
}

export interface DueSoonRow {
  assignment_id: number;
  title: string;
  class_id: number;
  class_name: string;
  due_at: string;
  submitted_count: number;
  student_count: number;
}

export interface TeacherDashboard {
  role: "TEACHER";
  cards: {
    my_classes: number;
    running_classes: number;
    open_assignments: number;
    pending_grading: number;
    students: number;
  };
  pending: PendingRow[];
  due_soon: DueSoonRow[];
}

export interface TodoRow {
  assignment_id: number;
  title: string;
  class_id: number;
  class_name: string;
  due_at: string;
}

export interface RecentGradeRow {
  assignment_id: number;
  title: string;
  class_id: number;
  class_name: string;
  score: number;
  maximum_score: number;
  graded_at: string;
}

export interface StudentDashboard {
  role: "STUDENT";
  cards: { my_classes: number; not_submitted: number; graded: number; average_score: number | null };
  todo: TodoRow[];
  recent_grades: RecentGradeRow[];
}

export type DashboardData = AdminDashboard | TeacherDashboard | StudentDashboard;
```

> `Role` đã tồn tại trong `types.ts`. Nếu tên khác (`UserRole`), dùng tên đang có thay vì thêm alias mới.

- [ ] **Step 2: Viết test thất bại cho `StatCard`**

```tsx
// frontend/src/test/components/StatCard.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatCard } from "../../components/StatCard";

describe("StatCard", () => {
  it("shows the value and its label", () => {
    render(<StatCard label="Bài chờ chấm" value={11} />);

    expect(screen.getByText("11")).toBeTruthy();
    expect(screen.getByText("Bài chờ chấm")).toBeTruthy();
  });

  it("renders an em dash when there is no value yet", () => {
    render(<StatCard label="Điểm trung bình" value={null} />);

    expect(screen.getByText("—")).toBeTruthy();
  });

  it("marks a warning tone so a backlog reads differently from a total", () => {
    const { container } = render(<StatCard label="Bài chưa nộp" value={3} tone="warn" />);

    expect(container.querySelector(".stat-card--warn")).toBeTruthy();
  });
});
```

- [ ] **Step 3: Chạy để xác nhận đỏ**

Run: `cd frontend && npm test -- StatCard`
Expected: FAIL — không tìm thấy module `StatCard`.

- [ ] **Step 4: Cài đặt**

```tsx
// frontend/src/components/StatCard.tsx
export function StatCard({ label, value, tone = "default" }: {
  label: string;
  value: number | null;
  tone?: "default" | "warn";
}) {
  return <div className={`stat-card${tone === "warn" ? " stat-card--warn" : ""}`}>
    <span className="stat-card-value">{value === null ? "—" : value}</span>
    <span className="stat-card-label">{label}</span>
  </div>;
}
```

```css
/* frontend/src/styles.css — thêm vào cuối */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 1rem;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: .25rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: .5rem;
  background: var(--color-surface);
}

.stat-card-value { font-size: 1.75rem; font-weight: 600; line-height: 1.1; }
.stat-card-label { font-size: .875rem; color: var(--color-muted); }
.stat-card--warn .stat-card-value { color: var(--color-warning); }
```

> Các token này là biến `@theme` có thật ở đầu `styles.css` (`--color-border`, `--color-surface`, `--color-muted`, `--color-warning`). **Không thêm biến màu mới** — bảng màu đã đóng.

- [ ] **Step 5: Chạy để xác nhận xanh, rồi commit**

Run: `cd frontend && npm test -- StatCard`
Expected: PASS 3 test.

```bash
git add frontend/src/types.ts frontend/src/components/StatCard.tsx frontend/src/styles.css frontend/src/test/components/StatCard.test.tsx
git commit -m "feat(dashboard): add the dashboard payload types and the stat card"
```

---

### Task 11: `DashboardPage` — fetch và chuyển tiếp theo role

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Create: `frontend/src/test/pages/DashboardPage.test.tsx`
- Create (stub): `frontend/src/pages/dashboard/AdminDashboardView.tsx`, `TeacherDashboardView.tsx`, `StudentDashboardView.tsx`

**Interfaces:**
- Consumes: `request` từ `lib/api`, `DashboardData` từ `types`.
- Produces: `<AdminDashboardView data={...} />`, `<TeacherDashboardView data={...} />`, `<StudentDashboardView data={...} />` — Task 12–14 chỉ thay phần thân của ba component này, không đụng `DashboardPage`.

`DashboardPage` là **chỗ duy nhất biết về mạng**. Ba view nhận payload qua props nên test chúng chỉ cần dựng object, không cần mock `fetch`.

- [ ] **Step 1: Viết test thất bại**

```tsx
// frontend/src/test/pages/DashboardPage.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { DashboardPage } from "../../pages/DashboardPage";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json" },
});

const adminPayload = {
  role: "ADMIN",
  accounts: { admins: 2, teachers: 3, students: 5 },
  classes: { running: 1, scheduled: 0, ended: 2, disabled: 1 },
  recent_audit: [],
};

const studentPayload = {
  role: "STUDENT",
  cards: { my_classes: 1, not_submitted: 2, graded: 0, average_score: null },
  todo: [],
  recent_grades: [],
};

function openPage(fetchMock: ReturnType<typeof vi.fn>) {
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><DashboardPage /></MemoryRouter>);
}

describe("Dashboard page", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders the admin view for an admin payload", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(adminPayload)));

    await waitFor(() => expect(screen.getByText("Tài khoản")).toBeTruthy());
  });

  it("renders the student view for a student payload", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(studentPayload)));

    await waitFor(() => expect(screen.getByText("Bài chưa nộp")).toBeTruthy());
  });

  it("shows a failure message instead of an empty screen", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json({ detail: "Server error." }, 500)));

    await waitFor(() => expect(screen.getByText("Server error.")).toBeTruthy());
  });

  it("asks for the dashboard exactly once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(adminPayload));
    openPage(fetchMock);

    await waitFor(() => expect(screen.getByText("Tài khoản")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/dashboard");
  });
});
```

- [ ] **Step 2: Chạy để xác nhận đỏ**

Run: `cd frontend && npm test -- DashboardPage`
Expected: FAIL — `DashboardPage` vẫn là stub, không có text "Tài khoản".

- [ ] **Step 3: Cài đặt — stub ba view trước**

```tsx
// frontend/src/pages/dashboard/AdminDashboardView.tsx
import { StatCard } from "../../components/StatCard";
import type { AdminDashboard } from "../../types";

export function AdminDashboardView({ data }: { data: AdminDashboard }) {
  return <section className="page-stack">
    <div className="page-header"><h1>Tổng quan</h1></div>
    <div className="stat-grid"><StatCard label="Tài khoản" value={data.accounts.students} /></div>
  </section>;
}
```

```tsx
// frontend/src/pages/dashboard/TeacherDashboardView.tsx
import { StatCard } from "../../components/StatCard";
import type { TeacherDashboard } from "../../types";

export function TeacherDashboardView({ data }: { data: TeacherDashboard }) {
  return <section className="page-stack">
    <div className="page-header"><h1>Tổng quan</h1></div>
    <div className="stat-grid"><StatCard label="Bài chờ chấm" value={data.cards.pending_grading} tone="warn" /></div>
  </section>;
}
```

```tsx
// frontend/src/pages/dashboard/StudentDashboardView.tsx
import { StatCard } from "../../components/StatCard";
import type { StudentDashboard } from "../../types";

export function StudentDashboardView({ data }: { data: StudentDashboard }) {
  return <section className="page-stack">
    <div className="page-header"><h1>Tổng quan</h1></div>
    <div className="stat-grid"><StatCard label="Bài chưa nộp" value={data.cards.not_submitted} tone="warn" /></div>
  </section>;
}
```

```tsx
// frontend/src/pages/DashboardPage.tsx — thay toàn bộ file
import { useEffect, useState } from "react";

import { Alert } from "../components/Alert";
import { Spinner } from "../components/Spinner";
import { request } from "../lib/api";
import type { DashboardData } from "../types";
import { AdminDashboardView } from "./dashboard/AdminDashboardView";
import { StudentDashboardView } from "./dashboard/StudentDashboardView";
import { TeacherDashboardView } from "./dashboard/TeacherDashboardView";

export function DashboardPage() {
  const [data, setData] = useState<DashboardData>();
  const [failure, setFailure] = useState("");
  useEffect(() => {
    request<DashboardData>("/dashboard", { token: sessionStorage.getItem("access_token") ?? undefined })
      .then((payload) => payload && setData(payload))
      .catch((error) => setFailure(error instanceof Error ? error.message : "Unable to load the dashboard."));
  }, []);
  if (failure) return <Alert>{failure}</Alert>;
  if (!data) return <Spinner label="Loading dashboard" />;
  if (data.role === "ADMIN") return <AdminDashboardView data={data} />;
  if (data.role === "TEACHER") return <TeacherDashboardView data={data} />;
  return <StudentDashboardView data={data} />;
}
```

- [ ] **Step 4: Chạy để xác nhận xanh**

Run: `cd frontend && npm test -- DashboardPage`
Expected: PASS 4 test.

Run: `cd frontend && npm run build`
Expected: `tsc --noEmit` sạch — nếu union chưa thu hẹp đúng, lỗi sẽ hiện ở đây chứ không ở test.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx frontend/src/pages/dashboard frontend/src/test/pages/DashboardPage.test.tsx
git commit -m "feat(dashboard): load the dashboard payload and route it by role"
```

---

### Task 12: `AdminDashboardView` đầy đủ

**Files:**
- Modify: `frontend/src/pages/dashboard/AdminDashboardView.tsx`
- Create: `frontend/src/test/pages/dashboard-views.test.tsx`

**Interfaces:**
- Consumes: `AdminDashboard` (Task 10), `StatCard` (Task 10), `describeAuditAction` từ `frontend/src/lib/auditActions.ts` (plan 08), `DataTable`/`Column` từ `components/Table`, `EmptyState`, `formatDateTime` từ `lib/format`.
- Produces: không có gì cho task sau.

> **CHẶN:** cần `lib/auditActions.ts` từ plan 08. Mở file đó và dùng đúng tên hàm nó xuất; ví dụ dưới giả định `describeAuditAction(action: string): string` trả câu tiếng Việt và trả lại chính `action` khi gặp mã lạ. Nếu tên khác, dùng tên thật — **đừng viết bản thứ hai**.

- [ ] **Step 1: Viết test thất bại**

```tsx
// frontend/src/test/pages/dashboard-views.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { AdminDashboardView } from "../../pages/dashboard/AdminDashboardView";
import type { AdminDashboard } from "../../types";

const admin: AdminDashboard = {
  role: "ADMIN",
  accounts: { admins: 2, teachers: 3, students: 5 },
  classes: { running: 1, scheduled: 4, ended: 2, disabled: 6 },
  recent_audit: [
    {
      id: 812,
      action: "class.created",
      target_label: "Web Development K18A",
      actor: { id: 1, full_name: "Le Quoc Bao", role: "ADMIN" },
      created_at: "2026-08-03T10:15:00Z",
    },
  ],
};

describe("Admin dashboard view", () => {
  it("shows every account and class number", () => {
    render(<MemoryRouter><AdminDashboardView data={admin} /></MemoryRouter>);

    for (const value of ["2", "3", "5", "1", "4", "6"]) {
      expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    }
  });

  it("renders an audit row with its resolved target", () => {
    render(<MemoryRouter><AdminDashboardView data={admin} /></MemoryRouter>);

    expect(screen.getByText("Web Development K18A")).toBeTruthy();
    expect(screen.getByText("Le Quoc Bao")).toBeTruthy();
  });

  it("says the log is empty instead of showing a bare table", () => {
    render(<MemoryRouter><AdminDashboardView data={{ ...admin, recent_audit: [] }} /></MemoryRouter>);

    expect(screen.getByText("Chưa có hoạt động nào.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Chạy để xác nhận đỏ**

Run: `cd frontend && npm test -- dashboard-views`
Expected: FAIL — view stub mới chỉ hiện một thẻ.

- [ ] **Step 3: Cài đặt**

```tsx
// frontend/src/pages/dashboard/AdminDashboardView.tsx — thay toàn bộ file
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { StatCard } from "../../components/StatCard";
import { DataTable, TruncatedText, type Column } from "../../components/Table";
import { describeAuditAction } from "../../lib/auditActions";
import { formatDateTime } from "../../lib/format";
import type { AdminDashboard, AuditRow } from "../../types";

const auditColumns: Column<AuditRow>[] = [
  { key: "time", header: "Thời gian", width: "12rem", render: (row) => formatDateTime(row.created_at) },
  { key: "actor", header: "Người thực hiện", width: "14rem", render: (row) => <TruncatedText>{row.actor.full_name ?? ""}</TruncatedText> },
  { key: "action", header: "Hành động", width: "14rem", render: (row) => describeAuditAction(row.action) },
  { key: "target", header: "Đối tượng", render: (row) => <TruncatedText>{row.target_label}</TruncatedText> },
];

export function AdminDashboardView({ data }: { data: AdminDashboard }) {
  return <section className="page-stack">
    <div className="page-header"><h1>Tổng quan</h1></div>

    <Card>
      <h2>Tài khoản</h2>
      <div className="stat-grid">
        <StatCard label="Quản trị viên" value={data.accounts.admins} />
        <StatCard label="Giảng viên" value={data.accounts.teachers} />
        <StatCard label="Học viên" value={data.accounts.students} />
      </div>
    </Card>

    <Card>
      <h2>Lớp học</h2>
      <div className="stat-grid">
        <StatCard label="Đang chạy" value={data.classes.running} />
        <StatCard label="Sắp bắt đầu" value={data.classes.scheduled} />
        <StatCard label="Đã kết thúc" value={data.classes.ended} />
        <StatCard label="Đã tắt" value={data.classes.disabled} />
      </div>
    </Card>

    <Card>
      <h2>Hoạt động gần đây</h2>
      {data.recent_audit.length === 0
        ? <EmptyState>Chưa có hoạt động nào.</EmptyState>
        : <DataTable columns={auditColumns} data={data.recent_audit} rowKey={(row) => row.id} />}
    </Card>
  </section>;
}
```

> Kiểm `frontend/src/lib/format.ts` xem hàm định dạng thời gian tên là gì (`formatDateTime`, `formatDate`, …) và dùng đúng tên đó.

- [ ] **Step 4: Chạy để xác nhận xanh, rồi commit**

Run: `cd frontend && npm test -- dashboard-views` → PASS 3 test.
Run: `cd frontend && npm run build` → sạch.

```bash
git add frontend/src/pages/dashboard/AdminDashboardView.tsx frontend/src/test/pages/dashboard-views.test.tsx
git commit -m "feat(dashboard): build out the admin dashboard"
```

---

### Task 13: `TeacherDashboardView` và `StudentDashboardView` đầy đủ

**Files:**
- Modify: `frontend/src/pages/dashboard/TeacherDashboardView.tsx`, `frontend/src/pages/dashboard/StudentDashboardView.tsx`, `frontend/src/test/pages/dashboard-views.test.tsx`

**Interfaces:**
- Consumes: `TeacherDashboard`, `StudentDashboard`, `StatCard`, `DataTable`, `EmptyState`, `formatDateTime`.
- Produces: không có gì cho task sau.

Hai view này đi chung một task vì chúng có cùng hình dạng (thẻ số + hai bảng) và cùng bộ component; tách ra chỉ tạo hai lần cùng một vòng review.

Mỗi dòng bảng là một link tới màn hình đã có, dùng đúng path đang khai báo trong `frontend/src/App.tsx`:

| Từ | Tới | Route trong `App.tsx` |
|---|---|---|
| `pending` | trang chấm | `/teacher/assignments/{assignment_id}/grade/{submission_id}` (dòng 70) |
| `due_soon` | trang assignment của teacher | `/teacher/assignments/{assignment_id}` (dòng 69) |
| `todo`, `recent_grades` | trang assignment của student | `/student/assignments/{assignment_id}` (dòng 75) |

Trang chấm cần **cả hai** id — `submission_id` một mình không đủ để dựng URL, đó là lý do `PendingRowSerializer` mang cả `assignment_id`.

- [ ] **Step 1: Viết test thất bại**

```tsx
// thêm vào frontend/src/test/pages/dashboard-views.test.tsx
import { StudentDashboardView } from "../../pages/dashboard/StudentDashboardView";
import { TeacherDashboardView } from "../../pages/dashboard/TeacherDashboardView";
import type { StudentDashboard, TeacherDashboard } from "../../types";

const teacher: TeacherDashboard = {
  role: "TEACHER",
  cards: { my_classes: 4, running_classes: 2, open_assignments: 6, pending_grading: 11, students: 63 },
  pending: [{
    submission_id: 991, assignment_id: 42, assignment_title: "Lab 3",
    class_id: 7, class_name: "Web Development K18A",
    student: { id: 55, full_name: "Tran Minh Anh" },
    submitted_at: "2026-08-03T09:40:00Z",
  }],
  due_soon: [{
    assignment_id: 44, title: "Lab 4", class_id: 7, class_name: "Web Development K18A",
    due_at: "2026-08-05T17:00:00Z", submitted_count: 12, student_count: 30,
  }],
};

const student: StudentDashboard = {
  role: "STUDENT",
  cards: { my_classes: 2, not_submitted: 3, graded: 8, average_score: 82.5 },
  todo: [{ assignment_id: 44, title: "Lab 4", class_id: 7, class_name: "Web Development K18A", due_at: "2026-08-05T17:00:00Z" }],
  recent_grades: [{
    assignment_id: 42, title: "Lab 3", class_id: 7, class_name: "Web Development K18A",
    score: 85, maximum_score: 100, graded_at: "2026-08-02T15:10:00Z",
  }],
};

describe("Teacher dashboard view", () => {
  it("shows the grading backlog and who is waiting", () => {
    render(<MemoryRouter><TeacherDashboardView data={teacher} /></MemoryRouter>);

    expect(screen.getByText("11")).toBeTruthy();
    expect(screen.getByText("Tran Minh Anh")).toBeTruthy();
  });

  it("shows how much of a due-soon assignment is in", () => {
    render(<MemoryRouter><TeacherDashboardView data={teacher} /></MemoryRouter>);

    expect(screen.getByText("12/30")).toBeTruthy();
  });

  it("celebrates an empty backlog instead of showing a bare table", () => {
    render(<MemoryRouter><TeacherDashboardView data={{ ...teacher, pending: [] }} /></MemoryRouter>);

    expect(screen.getByText("Không còn bài nào chờ chấm.")).toBeTruthy();
  });
});

describe("Student dashboard view", () => {
  it("shows the average score", () => {
    render(<MemoryRouter><StudentDashboardView data={student} /></MemoryRouter>);

    expect(screen.getByText("82.5")).toBeTruthy();
  });

  it("shows an em dash when nothing is graded yet", () => {
    render(<MemoryRouter><StudentDashboardView data={{
      ...student,
      cards: { ...student.cards, graded: 0, average_score: null },
    }} /></MemoryRouter>);

    expect(screen.getByText("—")).toBeTruthy();
  });

  it("shows a grade out of its maximum", () => {
    render(<MemoryRouter><StudentDashboardView data={student} /></MemoryRouter>);

    expect(screen.getByText("85/100")).toBeTruthy();
  });

  it("says the to-do list is empty instead of showing a bare table", () => {
    render(<MemoryRouter><StudentDashboardView data={{ ...student, todo: [] }} /></MemoryRouter>);

    expect(screen.getByText("Không có bài nào cần nộp.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Chạy để xác nhận đỏ**

Run: `cd frontend && npm test -- dashboard-views`
Expected: FAIL — hai view vẫn là stub một thẻ.

- [ ] **Step 3: Cài đặt**

```tsx
// frontend/src/pages/dashboard/TeacherDashboardView.tsx — thay toàn bộ file
import { Link } from "react-router-dom";

import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { StatCard } from "../../components/StatCard";
import { DataTable, TruncatedText, type Column } from "../../components/Table";
import { formatDateTime } from "../../lib/format";
import type { DueSoonRow, PendingRow, TeacherDashboard } from "../../types";

const pendingColumns: Column<PendingRow>[] = [
  { key: "student", header: "Học viên", width: "14rem", render: (row) => <TruncatedText>{row.student.full_name ?? ""}</TruncatedText> },
  { key: "assignment", header: "Bài tập", width: "14rem", render: (row) => <TruncatedText>{row.assignment_title}</TruncatedText> },
  { key: "class", header: "Lớp", render: (row) => <TruncatedText>{row.class_name}</TruncatedText> },
  { key: "at", header: "Nộp lúc", width: "12rem", render: (row) => formatDateTime(row.submitted_at) },
  { key: "action", header: "", width: "6rem", render: (row) => <Link to={`/teacher/assignments/${row.assignment_id}/grade/${row.submission_id}`}>Chấm</Link> },
];

const dueSoonColumns: Column<DueSoonRow>[] = [
  { key: "title", header: "Bài tập", width: "14rem", render: (row) => <Link to={`/teacher/assignments/${row.assignment_id}`}>{row.title}</Link> },
  { key: "class", header: "Lớp", render: (row) => <TruncatedText>{row.class_name}</TruncatedText> },
  { key: "due", header: "Hạn nộp", width: "12rem", render: (row) => formatDateTime(row.due_at) },
  { key: "progress", header: "Đã nộp", width: "8rem", render: (row) => `${row.submitted_count}/${row.student_count}` },
];

export function TeacherDashboardView({ data }: { data: TeacherDashboard }) {
  return <section className="page-stack">
    <div className="page-header"><h1>Tổng quan</h1></div>

    <div className="stat-grid">
      <StatCard label="Lớp của tôi" value={data.cards.my_classes} />
      <StatCard label="Đang chạy" value={data.cards.running_classes} />
      <StatCard label="Bài đang mở" value={data.cards.open_assignments} />
      <StatCard label="Bài chờ chấm" value={data.cards.pending_grading} tone="warn" />
      <StatCard label="Học viên" value={data.cards.students} />
    </div>

    <Card>
      <h2>Chờ chấm</h2>
      {data.pending.length === 0
        ? <EmptyState>Không còn bài nào chờ chấm.</EmptyState>
        : <DataTable columns={pendingColumns} data={data.pending} rowKey={(row) => row.submission_id} />}
    </Card>

    <Card>
      <h2>Sắp tới hạn</h2>
      {data.due_soon.length === 0
        ? <EmptyState>Không có bài nào tới hạn trong 7 ngày tới.</EmptyState>
        : <DataTable columns={dueSoonColumns} data={data.due_soon} rowKey={(row) => row.assignment_id} />}
    </Card>
  </section>;
}
```

```tsx
// frontend/src/pages/dashboard/StudentDashboardView.tsx — thay toàn bộ file
import { Link } from "react-router-dom";

import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { StatCard } from "../../components/StatCard";
import { DataTable, TruncatedText, type Column } from "../../components/Table";
import { formatDateTime } from "../../lib/format";
import type { RecentGradeRow, StudentDashboard, TodoRow } from "../../types";

const todoColumns: Column<TodoRow>[] = [
  { key: "title", header: "Bài tập", width: "16rem", render: (row) => <Link to={`/student/assignments/${row.assignment_id}`}>{row.title}</Link> },
  { key: "class", header: "Lớp", render: (row) => <TruncatedText>{row.class_name}</TruncatedText> },
  { key: "due", header: "Hạn nộp", width: "12rem", render: (row) => formatDateTime(row.due_at) },
];

const gradeColumns: Column<RecentGradeRow>[] = [
  { key: "title", header: "Bài tập", width: "16rem", render: (row) => <TruncatedText>{row.title}</TruncatedText> },
  { key: "class", header: "Lớp", render: (row) => <TruncatedText>{row.class_name}</TruncatedText> },
  { key: "score", header: "Điểm", width: "8rem", render: (row) => `${row.score}/${row.maximum_score}` },
  { key: "at", header: "Chấm lúc", width: "12rem", render: (row) => formatDateTime(row.graded_at) },
];

export function StudentDashboardView({ data }: { data: StudentDashboard }) {
  return <section className="page-stack">
    <div className="page-header"><h1>Tổng quan</h1></div>

    <div className="stat-grid">
      <StatCard label="Lớp đang học" value={data.cards.my_classes} />
      <StatCard label="Bài chưa nộp" value={data.cards.not_submitted} tone="warn" />
      <StatCard label="Bài đã chấm" value={data.cards.graded} />
      <StatCard label="Điểm trung bình" value={data.cards.average_score} />
    </div>

    <Card>
      <h2>Cần nộp</h2>
      {data.todo.length === 0
        ? <EmptyState>Không có bài nào cần nộp.</EmptyState>
        : <DataTable columns={todoColumns} data={data.todo} rowKey={(row) => row.assignment_id} />}
    </Card>

    <Card>
      <h2>Điểm gần đây</h2>
      {data.recent_grades.length === 0
        ? <EmptyState>Chưa có điểm nào.</EmptyState>
        : <DataTable columns={gradeColumns} data={data.recent_grades} rowKey={(row) => row.assignment_id} />}
    </Card>
  </section>;
}
```

> `StatCard` nhận `value: number | null` nên `average_score` truyền thẳng — đó là lý do nó được khai kiểu như vậy ở Task 10.

- [ ] **Step 4: Chạy toàn bộ frontend**

Run: `cd frontend && npm test`
Expected: PASS toàn bộ, không hồi quy ở test cũ.

Run: `cd frontend && npm run build`
Expected: sạch.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/dashboard frontend/src/test/pages/dashboard-views.test.tsx
git commit -m "feat(dashboard): build out the teacher and student dashboards"
```

---

### Task 14: Tài liệu

**Files:**
- Create: `docs/overview/09-dashboard.md`
- Modify: `docs/overview/00-system-overview.md` (bảng §5)

**Interfaces:**
- Consumes: hành vi đã cài đặt ở Task 1–13.
- Produces: không có gì cho task sau.

`docs/overview/` là thiết kế đích của hệ thống; một feature đã tồn tại trong code mà không có doc ở đây sẽ bị người sau coi là chưa có. Viết doc **sau khi** code chạy, và mô tả đúng cái đã build — không mô tả cái định build.

- [ ] **Step 1: Viết `docs/overview/09-dashboard.md`**

Theo đúng khung của các file 01–08 cùng thư mục: `# Feature: Dashboard`, rồi các mục `1. Purpose`, `2. Screens (ASCII)`, `3. API`, `4. DB`, `5. Key functions / rules`, `6. Edge cases`. Nội dung bắt buộc phải có:

- §1: một dòng nói dashboard là màn hình sau đăng nhập, chỉ đọc, và ba role thấy ba thứ khác nhau.
- §2: ba khối ASCII, một cho mỗi role, vẽ đúng các thẻ và cột đã build ở Task 12–13.
- §3: bảng một dòng — `GET /api/dashboard`, mọi role đã đăng nhập, payload đổi hình theo role người gọi, không nhận query param.
- §4: một câu — **không có bảng nào**; app `dashboard` không sở hữu dữ liệu, nó đọc từ `users`, `classes`, `enrollments`, `assignments`, `submissions`, `assignment_grades`, `grades`, `audit_logs`.
- §5: luật scope (`scoped_classes`), luật cửa sổ lớp (`is_open` / `open_class_q` và test đồng thuận giữ chúng khớp), ngân sách ≤8 query, và việc dashboard không ghi audit.
- §6: bài quá hạn không vào `not_submitted`/`todo` và tại sao; `pending_grading` đếm cặp chứ không đếm bản nộp; `average_score` là `null` chứ không phải 0; `students` của teacher là distinct người.

- [ ] **Step 2: Nối vào bảng §5 của `00-system-overview.md`**

Thêm một dòng vào bảng "Backend apps → feature docs map", sau dòng `audit`:

```markdown
| `dashboard` | [09-dashboard](09-dashboard.md) |
```

- [ ] **Step 3: Kiểm chéo doc với code**

Đọc lại `backend/dashboard/services.py` cạnh doc vừa viết. Mọi con số, giới hạn (5/10/5) và tên khoá trong doc phải khớp hằng số trong code (`_RECENT_AUDIT_LIMIT`, `_PENDING_LIMIT`, `_DUE_SOON_LIMIT`, `_TODO_LIMIT`, `_RECENT_GRADES_LIMIT`, `_DUE_SOON_WINDOW`). Sửa doc cho khớp code, không sửa code cho khớp doc.

- [ ] **Step 4: Chạy toàn bộ**

Run: `cd backend && python manage.py test`
Run: `cd frontend && npm test && npm run build`
Expected: PASS cả hai.

- [ ] **Step 5: Commit**

```bash
git add docs/overview/09-dashboard.md docs/overview/00-system-overview.md
git commit -m "docs(dashboard): document the role dashboards"
```

---

## Sau khi xong

Chạy `superpowers:requesting-code-review` trên toàn bộ nhánh trước khi mở PR. Ba chỗ đáng soi kỹ nhất:

1. `_pending_rows` — subquery `latest_id` là chỗ dễ sai nhất trong plan này; kiểm bằng dữ liệu có nhiều version.
2. `_due_soon_rows` — `distinct=True` trên hai `Count` cùng query; bỏ một cái là số sai mà không có test nào ngoài `TeacherListTests` bắt được.
3. Ngân sách query — nếu `QueryBudgetTests` đã bị nới ngưỡng trong lúc làm, đó là nợ, không phải xong việc.
