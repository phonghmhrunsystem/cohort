# Plan: Notifications & Class Resources (docs/overview/07-notifications-and-resources.md)

> **For agentic workers:** REQUIRED SUB-SKILL: dùng `superpowers:subagent-driven-development` (khuyến nghị) hoặc `superpowers:executing-plans` để chạy plan này theo từng task. Các bước dùng cú pháp checkbox (`- [ ]`).

**Goal:** Đưa notification fan-out từ "chỉ có bảng DB + 2 endpoint" lên đúng spec 07 — chuông + panel trong AppShell, `read-all`, `link` nullable — và hiện thực hoá Class resources ở cả phía Student lẫn Teacher.

**Architecture:** Backend đã có `Notification`, `create_notifications`, `notify_user`, `ClassResource` và 4 endpoint; thiếu `read-all`, `link` nullable, thứ tự ổn định (cả notification lẫn resource) và toàn bộ test. Frontend là con số 0: `/notifications` là `Placeholder`, tab "Class resources" là một dòng chữ chờ.

**Spec đã được đồng bộ trước khi viết plan này** (`docs/overview/07-notifications-and-resources.md` + đoạn Altitude của `00-system-overview.md`): §2.1 nay mô tả đúng shell `.app-shell > aside.sidebar + main.canvas > header > .header-actions` thay vì `.workspace-topbar` không tồn tại, panel dùng lại idiom `.action-menu-panel` với `z-index: 15`, và chỉ thêm hai token màu. Plan này thi hành spec đó — **không còn quyết định "làm khác spec" nào**; các mục D bên dưới ghi lại lý do cho người đọc sau.

**Tech Stack:** Django 5 + DRF (`backend/notifications`, `backend/classes`), React 19 + Vite + TypeScript + Tailwind v4 (`frontend/src`), test: `python manage.py test`, `npm test` (vitest + Testing Library).

## Global Constraints

- API dưới `/api`; mã lỗi: `401` chưa đăng nhập, `403` sai quyền, `404` không tồn tại/ngoài phạm vi, `422` lỗi validate/nghiệp vụ (AGENTS.md).
- Mọi `write_audit` và fan-out notification phải nằm trong `transaction.atomic()` của view gọi nó — hiện tại cả 4 call site đều đã đúng, không được phá.
- `safe_metadata` **loại bỏ mọi chuỗi**; metadata chỉ chứa số/bool/list/dict.
- Text hiển thị cho người dùng viết tiếng Việt có dấu, giống các trang đã có (`Chưa nộp`, `Đã chấm`...).
- Token màu chỉ khai báo trong `@theme` của `frontend/src/styles.css`; không hardcode hex trong component. **Không** khai báo `--radius-*` / `--shadow-*` trong `@theme`: đó là namespace của Tailwind v4, đặt `--radius-md` sẽ đổi luôn mọi utility `rounded-md` trong app.
- Không sửa file ngoài phạm vi 2 feature này. `docs/overview/*.md` đã được đồng bộ trước khi plan chạy — Task 11 chỉ còn là bước kiểm lại.
- CSS mới bám các lớp sẵn có (`.action-menu-panel`, `.header-actions`, `.tabs`, `.muted`, `.empty-state`) thay vì dựng hệ thống thứ hai.

Trạng thái audit: 2026-08-02, branch `worktree-plans-notifications-audit` @ `b7c3c63` (code app không đổi so với `72ec5a0`).

---

## 0. Kết luận nhanh

| Mảng | Trạng thái |
|---|---|
| DB `notifications`, `class_resources` | **Có** — đúng spec §4, trừ `link` không nullable |
| `create_notifications` / `notify_user` | **Có**, cả 4 call site đều trong `transaction.atomic()` ✔ |
| `GET /api/notifications`, `POST /{id}/read` | **Có** |
| `POST /api/notifications/read-all` | **Chưa có** |
| `GET/POST /api/classes/{id}/resources` | **Có** |
| Test backend cho notifications | **Không tồn tại** — `backend/notifications/` không có thư mục `tests/` |
| Chuông + panel frontend | **Chưa có** — header chỉ có `<Link to="/notifications">`, route trỏ vào `Placeholder` |
| Type TS `Notification` | **Chưa có** (spec §2.1 nói "chỉ thiếu `type`/`created_at`" — sai, không có type nào cả) |
| Component `ClassResources` | **Chưa có** — tab Student render `<p>Class resources — see 07-...</p>` |
| UI tạo resource cho Teacher | **Chưa có** → hôm nay không có đường nào tạo resource trong app |
| Thứ tự `GET /classes/{id}/resources` | **Không xác định** — `classroom.resources.all()`, model không có `Meta.ordering`, không có `created_at` |
| Test `App.test.tsx` đang khẳng định link `Notifications` | **Sẽ đỏ** khi bỏ link chuông — phải sửa trong cùng task |

Khối lượng ước tính: ~0.5 ngày backend, ~1.5 ngày frontend.

---

## 1. Audit: spec vs code

| # | Spec | Code hiện tại | File | Mức |
|---|---|---|---|---|
| N1 | `link` nullable; `CLASS_UNASSIGNED` mang `link = null`, render text thường (§5, §6) | `link = models.CharField(max_length=255)` không `null=True`; call site gửi `"/teacher/classes"` | `notifications/models.py:9`, `classes/views.py:112` | Cao |
| N2 | `POST /api/notifications/read-all` → một `update()`, trả `{unread_count: 0}` (§3) | Không có route, không có view | `notifications/urls.py` | Cao |
| N3 | Danh sách "newest first" (§3) | `order_by("-created_at")` không có tie-break `-id`; `bulk_create` ghi cùng `created_at` cho cả roster → thứ tự không ổn định | `notifications/views.py:14` | Trung bình |
| N4 | — | Không có test nào cho notifications | `notifications/` | Cao |
| N5 | Chuông là `<button aria-expanded aria-controls>` + panel thả xuống, badge ẩn khi `unread_count === 0` (§2.1) | `<Link className="notification-link" to="/notifications">`, route render `<Placeholder title="Notifications" />` | `components/AppShell.tsx:79`, `App.tsx:66` | Cao |
| N6 | Item = `[chấm chưa đọc][icon theo type][title clamp 2 dòng][thời gian tương đối]`, fallback icon chuông cho `type` lạ (§2.1) | Không có | — | Cao |
| N7 | Thời gian tương đối `Vừa xong → N phút trước → ... → dd/MM/yyyy` (§2.1) | `lib/format.ts` chỉ có `formatDate`, `formatDateTime`, `deadlineBadge` | `lib/format.ts` | Cao |
| N8 | Panel dùng `--color-accent` + `--color-primary-soft`, radius/shadow theo `.action-menu-panel` (§2.1 sau khi sửa spec) | Hai token màu chưa có; `.action-menu-panel` đã có sẵn `z-index: 10`, radius `.5rem`, shadow `0 4px 12px #0f172a20` | `styles.css:3-15`, `styles.css:157` | Cao |
| N9 | Tab "Class resources" liệt kê resource, empty state `(No resources yet.)` (§2.2) | Placeholder text | `pages/student/StudentClassPage.tsx:56` | Cao |
| N10 | `components/ClassResources` là component hiển thị dùng chung (§2.3) | Không tồn tại | `components/` | Cao |
| N11 | Resource creation không gắn lifecycle (không `is_open`, không deadline) | ✔ Đúng — `ClassResourcesView.post` chỉ kiểm `teacher=request.user` | `classes/views.py:318` | OK |
| N12 | Resource creation **không** ghi audit (§2.3, 08 §5.1) | ✔ Đúng trạng thái hôm nay, nhưng 08 §5.1 gọi đây là *inconsistency cần sửa* | `classes/views.py:322` | Chuyển sang [plan 08](08-audit-log-plan.md) |
| N13 | Fan-out không lọc `is_active` (§5) | ✔ Đúng | `notifications/services.py:5` | OK |
| N14 | `GET /classes/{id}/resources` trả newest first (§2.2 sau khi sửa spec) | `classroom.resources.all()` — không `order_by`, model không `Meta.ordering`, không có `created_at` → thứ tự do DB quyết | `classes/views.py:316`, `classes/models.py:29` | Trung bình |
| N15 | Bỏ link `/notifications` khỏi header (§2.1) | `App.test.tsx:48-49` đang assert `getByRole("link", { name: "Notifications" })` cho TEACHER và STUDENT → task 8 làm đỏ test cũ nếu không sửa cùng lúc | `test/App.test.tsx:46-68` | Cao |
| N16 | Tab "Class resources" trên `TeacherClassPage` (§2.3) | Whitelist tab hiện là `"assignments" \| "gradebook"`, mọi giá trị khác rơi về `"students"` → `?tab=resources` sẽ không bao giờ render | `pages/teacher/TeacherClassPage.tsx:37-38` | Cao |
| N17 | `link` nullable ở DB (§4) | Migration `0001_initial` khai `link` NOT NULL; chỉ có 1 migration trong app | `notifications/migrations/` | Cao (đi cùng N1) |

Điểm **đúng spec, không đụng vào**: `Notification` không có cơ chế xoá/hết hạn; `read_at` là transition duy nhất; `POST /{id}/read` idempotent qua `if notification.read_at is None`; `get_object_or_404(..., recipient=request.user)` → user khác lấy `404` chứ không `403`; `ClassResourceSerializer` validate title 2–150 và `URLField(max_length=2048)`; `create_notifications` đọc `classroom.enrollments` bằng `values_list` (một query, không N+1).

---

## 2. Quyết định cần chốt trước khi code

### D1 — `CLASS_UNASSIGNED` mất link

Spec §5 và §6 nói rõ: giáo viên bị gỡ khỏi Class ra khỏi `scoped_classes` ngay khi write commit, nên mọi route vào Class đó sẽ `404`; row render như text thường. Code hiện gửi `"/teacher/classes"` — không `404` (đó là trang danh sách, không phải trang Class), nhưng click vào chỉ đưa họ tới danh sách không còn Class đó, tức là một cú click không nói thêm điều gì.

**Đề xuất: theo spec** — `link = None`, cột `link` thành `null=True`, panel render row không có link. Chi phí: 1 migration + 1 dòng call site + nhánh render.

### D2 — Vị trí chuông: shell không đổi (spec §2.1 đã sửa)

Spec cũ mô tả một ca phẫu thuật `.workspace` → `div.workspace-main` bọc `header.workspace-topbar`, và nói chuông hiện là một `<details>` trong sidebar. **Không có gì trong đó tồn tại**: `AppShell` là `.app-shell > aside.sidebar + main.canvas > header`, chuông hiện là `<Link className="notification-link" to="/notifications">` nằm sẵn trong `.header-actions` cạnh `UserMenu`, ở mọi breakpoint. (`header` này *không* sticky — `.canvas header` không có `position: sticky`; đừng khẳng định ngược lại trong doc.)

**Đã chốt:** spec §2.1 viết lại theo shell thật; plan chỉ thay `<Link>` bằng `<NotificationBell />` tại chỗ và xoá route `/notifications` + `Placeholder`. Không đụng layout.

### D3 — Token: hai màu, không thêm radius/shadow

Bảng màu hiện tại: `nav`, `primary`, `success`, `warning`, `danger`, `canvas`, `surface`, `text`, `muted`, `border`, `focus-ring`.

**Đã chốt:** thêm đúng hai token màu vào `@theme`:

- `--color-accent: #7C3AED` — badge + chấm chưa đọc. Violet tách bạch với `primary` (xanh, hành động) và `danger` (đỏ, lỗi); một notification chưa đọc không phải lỗi.
- `--color-primary-soft: #EFF6FF` — nền row chưa đọc. Spec gọi tên token này; `#EFF6FF` là đúng sắc xanh nhạt `.pagination-page:hover` đang hardcode, nên thêm token là dọn dẹp chứ không phải phát minh màu mới.

**Không** thêm `--radius-md` / `--shadow-md`: trong Tailwind v4 đó là namespace của chính Tailwind (`--radius-*`, `--shadow-*` sinh ra `rounded-md`, `shadow-md`), khai trong `@theme` sẽ đổi lặng lẽ mọi utility tương ứng toàn app. Panel dùng lại đúng giá trị của `.action-menu-panel` (radius `.5rem`, shadow `0 4px 12px #0f172a20`) — cùng một idiom dropdown với `UserMenu` ngay cạnh nó.

`z-index` của panel là **15**, không phải `1035` như spec cũ ghi: thang z thật của app là `.action-menu-panel: 10` < panel: 15 < `.drawer-backdrop: 20` < `.sidebar: 21` < `.toast-stack: 100`. Đặt 1035 sẽ khiến panel đè lên cả drawer mobile.

### D4 — UI tạo resource cho Teacher (mở rộng phạm vi có chủ ý)

Spec §2.3 nói "chưa có màn hình teacher nào, coi việc tạo resource thuộc về màn hình nào nhúng `ClassResources`". Thực tế: **không màn hình nào nhúng nó**, nên `POST /api/classes/{id}/resources` hôm nay không thể gọi từ trong app, và tab Student sẽ vĩnh viễn rỗng sau khi làm xong Task 9.

**Đã chốt:** làm Task 10 (tab "Class resources" trên `TeacherClassPage` gồm form tạo + danh sách), và spec §2.3 đã được viết lại để mô tả đúng màn hình đó. Nếu bị cắt, Task 1–9 vẫn ship được nhưng feature chỉ chứng minh được bằng data seed.

### D5 — Ngôn ngữ trong form tạo resource

`TeacherClassPage` hiện trộn: label field tiếng Anh (`Title`, `Description`, `Due at`, `Search`), nút hành động tiếng Việt (`Tạo assignment`), nút form tiếng Anh (`Save`, `Cancel`).

**Đã chốt:** form resource theo đúng khuôn hàng xóm trên cùng trang — label `Title` / `Description` / `URL`, nút `Tạo tài liệu`. Nhất quán trong một màn hình thắng nhất quán toàn app; đổi toàn bộ label sang tiếng Việt là một việc riêng, không thuộc plan này. Text *mới hoàn toàn* (panel thông báo, empty state, thông báo lỗi) vẫn tiếng Việt như Global Constraints.

---

## 3. File Structure

**Backend**

| File | Trách nhiệm |
|---|---|
| `backend/notifications/models.py` | sửa: `link` nullable |
| `backend/notifications/migrations/000X_link_nullable.py` | tạo |
| `backend/notifications/views.py` | sửa: ordering ổn định; thêm `NotificationReadAllView` |
| `backend/notifications/urls.py` | sửa: route `notifications/read-all` |
| `backend/notifications/tests/__init__.py`, `test_notifications.py` | tạo: toàn bộ coverage cho app |
| `backend/classes/views.py:112` | sửa: `notify_user(..., link=None)` |
| `backend/classes/views.py:316` | sửa: `resources.order_by("-id")` (N14) |
| `backend/classes/tests/test_classes.py` | sửa: test call site + thứ tự resource |

**Frontend**

| File | Trách nhiệm |
|---|---|
| `frontend/src/types.ts` | thêm `Notification`, `NotificationList`, `ClassResource` |
| `frontend/src/lib/format.ts` | thêm `relativeTime(value, now)` |
| `frontend/src/components/Icon.tsx` | thêm icon `clipboard` |
| `frontend/src/components/NotificationBell.tsx` | tạo: nút + panel + trạng thái optimistic (một file, vì badge và panel dùng chung `unread_count`) |
| `frontend/src/components/ClassResources.tsx` | tạo: component hiển thị dùng chung cho Student + Teacher |
| `frontend/src/components/AppShell.tsx` | sửa: thay link chuông bằng `<NotificationBell />` |
| `frontend/src/App.tsx` | sửa: xoá route `/notifications` |
| `frontend/src/pages/student/StudentClassPage.tsx` | sửa: tab resources dùng `ClassResources` |
| `frontend/src/pages/teacher/TeacherClassPage.tsx` | sửa: whitelist tab nhận `"resources"` + tab mới có form tạo (D4, N16) |
| `frontend/src/styles.css` | sửa: 2 token màu, xoá `.notification-link`, thêm `.notification-*` + `.resource-list` |
| `frontend/src/test/lib/format.test.ts` | sửa: test `relativeTime` |
| `frontend/src/test/App.test.tsx` | sửa: bỏ `"Notifications"` khỏi bảng nav `it.each` (N15) + test chuông |
| `frontend/src/test/components/NotificationBell.test.tsx`, `ClassResources.test.tsx` | tạo |

---

## 4. Backend

Chạy test: `cd backend && python manage.py test notifications` (và `classes` khi đụng call site).

### Task 1: Bọc lưới an toàn cho app notifications

**Files:**
- Create: `backend/notifications/tests/__init__.py`
- Create: `backend/notifications/tests/test_notifications.py`

**Interfaces:**
- Consumes: `accounts.models.User`, `notifications.models.Notification`.
- Produces: lớp `NotificationApiTests` với `setUp` tạo `self.student`, `self.other`, và hai row (`self.unread`, `self.read`) — Task 2–4 nối test vào lớp này.

- [ ] **Step 1: Viết test đỏ**

```python
# backend/notifications/tests/test_notifications.py
from django.utils import timezone
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from notifications.models import Notification


class NotificationApiTests(TestCase):
    def setUp(self):
        self.student = User.objects.create_user("student@example.test", "pw", role="STUDENT")
        self.other = User.objects.create_user("other@example.test", "pw", role="STUDENT")
        self.read = Notification.objects.create(
            recipient=self.student, type="ASSIGNMENT_CREATED", title="New assignment: Lab 1",
            link="/student/assignments/1", read_at=timezone.now(),
        )
        self.unread = Notification.objects.create(
            recipient=self.student, type="RESOURCE_CREATED", title="New resource: Slides",
            link="/student/classes/1",
        )
        self.client = APIClient()

    def authenticate(self, user):
        self.client.force_authenticate(user=user)
        return self.client

    def test_list_returns_unread_count_and_own_rows_only(self):
        Notification.objects.create(recipient=self.other, type="ASSIGNMENT_CREATED", title="Not mine", link="/x")
        response = self.authenticate(self.student).get("/api/notifications")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["unread_count"], 1)
        self.assertEqual([item["title"] for item in response.data["items"]],
                         ["New resource: Slides", "New assignment: Lab 1"])

    def test_list_requires_authentication(self):
        self.assertEqual(APIClient().get("/api/notifications").status_code, 401)

    def test_read_is_idempotent_and_scoped_to_the_recipient(self):
        client = self.authenticate(self.student)
        first = client.post(f"/api/notifications/{self.unread.id}/read")
        self.assertEqual(first.status_code, 200)
        marked_at = first.data["read_at"]
        self.assertIsNotNone(marked_at)
        second = client.post(f"/api/notifications/{self.unread.id}/read")
        self.assertEqual(second.data["read_at"], marked_at)
        self.assertEqual(self.authenticate(self.other)
                         .post(f"/api/notifications/{self.unread.id}/read").status_code, 404)

    def test_serializer_exposes_type_and_created_at(self):
        item = self.authenticate(self.student).get("/api/notifications").data["items"][0]
        self.assertEqual(
            set(item), {"id", "type", "title", "link", "created_at", "read_at"},
        )
```

- [ ] **Step 2: Chạy để xác nhận đỏ ở đúng chỗ**

Run: `cd backend && python manage.py test notifications -v 2`
Expected: 4 test chạy; nếu có lỗi thì phải là do assert, không phải `ModuleNotFoundError`. Nếu cả 4 PASS ngay thì đây là baseline hợp lệ — ghi nhận và đi tiếp.

- [ ] **Step 3: Commit**

```bash
git add backend/notifications/tests
git commit -m "test(notifications): cover the list and read endpoints"
```

### Task 2: Thứ tự newest-first ổn định (N3)

**Files:**
- Modify: `backend/notifications/views.py:14`
- Test: `backend/notifications/tests/test_notifications.py`

**Interfaces:**
- Consumes: `NotificationApiTests` từ Task 1.
- Produces: không có API mới.

- [ ] **Step 1: Viết test đỏ**

```python
    def test_rows_created_in_one_bulk_write_keep_a_stable_newest_first_order(self):
        stamp = timezone.now()
        rows = Notification.objects.bulk_create([
            Notification(recipient=self.student, type="ASSIGNMENT_CREATED", title=f"Bulk {index}", link="/x")
            for index in range(3)
        ])
        Notification.objects.filter(id__in=[row.id for row in rows]).update(created_at=stamp)
        titles = [item["title"] for item in
                  self.authenticate(self.student).get("/api/notifications").data["items"][:3]]
        self.assertEqual(titles, ["Bulk 2", "Bulk 1", "Bulk 0"])
```

- [ ] **Step 2: Chạy để xác nhận fail**

Run: `cd backend && python manage.py test notifications.tests.test_notifications.NotificationApiTests.test_rows_created_in_one_bulk_write_keep_a_stable_newest_first_order -v 2`
Expected: FAIL — thứ tự trong `AssertionError` không phải `['Bulk 2', 'Bulk 1', 'Bulk 0']` (SQLite trả theo insert order khi `created_at` bằng nhau).

- [ ] **Step 3: Sửa ordering**

```python
# backend/notifications/views.py — trong NotificationsView.get
        rows = Notification.objects.filter(recipient=request.user).order_by("-created_at", "-id")
```

- [ ] **Step 4: Chạy lại**

Run: `cd backend && python manage.py test notifications -v 2`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add backend/notifications/views.py backend/notifications/tests/test_notifications.py
git commit -m "fix(notifications): break created_at ties by id so a fan-out keeps its order"
```

### Task 3: `link` nullable và `CLASS_UNASSIGNED` không mang link (N1, D1)

**Files:**
- Modify: `backend/notifications/models.py:9`
- Create: `backend/notifications/migrations/000X_notification_link_nullable.py` (do `makemigrations` sinh)
- Modify: `backend/classes/views.py:112`
- Test: `backend/notifications/tests/test_notifications.py`, `backend/classes/tests/test_classes.py`

**Interfaces:**
- Consumes: `notify_user(user, type, title, link)` — chữ ký không đổi, chỉ giá trị truyền vào đổi thành `None`.
- Produces: `NotificationSerializer` trả `link: null` cho row `CLASS_UNASSIGNED`; frontend Task 7 dựa vào đúng điều này.

- [ ] **Step 1: Viết test đỏ (notifications)**

```python
    def test_a_row_can_be_stored_without_a_link(self):
        Notification.objects.create(
            recipient=self.student, type="CLASS_UNASSIGNED", title="Unassigned from Cohort 5", link=None,
        )
        item = self.authenticate(self.student).get("/api/notifications").data["items"][0]
        self.assertEqual(item["type"], "CLASS_UNASSIGNED")
        self.assertIsNone(item["link"])
```

- [ ] **Step 2: Viết test đỏ (call site)**

Thêm vào `backend/classes/tests/test_classes.py`, trong lớp test đã bao phủ `PATCH /api/classes/{id}` (tìm bằng `grep -n "teacher_changed\|class.teacher_changed" backend/classes/tests/test_classes.py`; nếu chưa có, thêm test mới vào lớp test PATCH hiện hữu):

```python
    def test_reassigning_a_class_notifies_both_teachers_and_leaves_the_outgoing_row_linkless(self):
        from notifications.models import Notification

        response = self.authenticate(self.admin).patch(
            f"/api/classes/{self.class_.id}", {"teacher_id": self.other_teacher.id}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        outgoing = Notification.objects.get(recipient=self.teacher, type="CLASS_UNASSIGNED")
        incoming = Notification.objects.get(recipient=self.other_teacher, type="CLASS_ASSIGNED")
        self.assertIsNone(outgoing.link)
        self.assertEqual(incoming.link, f"/teacher/classes/{self.class_.id}")
```

> Tên fixture (`self.admin`, `self.class_`, `self.teacher`, `self.other_teacher`, helper `authenticate`) phải khớp lớp test bạn chèn vào — đọc `setUp` của lớp đó trước khi dán.

- [ ] **Step 3: Chạy để xác nhận fail**

Run: `cd backend && python manage.py test notifications classes -v 2`
Expected: FAIL — `IntegrityError: NOT NULL constraint failed: notifications_notification.link` ở test đầu, và `AssertionError: '/teacher/classes' != None` ở test thứ hai.

- [ ] **Step 4: Sửa model + call site**

```python
# backend/notifications/models.py
    link = models.CharField(max_length=255, null=True, blank=True)
```

```python
# backend/classes/views.py:112
                notify_user(User.objects.get(id=previous_teacher_id), "CLASS_UNASSIGNED", f"Unassigned from {class_.name}", None)
```

- [ ] **Step 5: Sinh migration**

Run: `cd backend && python manage.py makemigrations notifications`
Expected: tạo `notifications/migrations/000X_alter_notification_link.py` với `AlterField`. Mở file, xác nhận chỉ có đúng một `AlterField` — không có operation lạ nào đi kèm.

- [ ] **Step 6: Chạy lại**

Run: `cd backend && python manage.py test notifications classes -v 2`
Expected: PASS toàn bộ.

- [ ] **Step 7: Commit**

```bash
git add backend/notifications backend/classes/views.py backend/classes/tests/test_classes.py
git commit -m "feat(notifications): let a notification carry no link and drop it for CLASS_UNASSIGNED"
```

### Task 4: `POST /api/notifications/read-all` (N2)

**Files:**
- Modify: `backend/notifications/views.py`
- Modify: `backend/notifications/urls.py`
- Test: `backend/notifications/tests/test_notifications.py`

**Interfaces:**
- Produces: `POST /api/notifications/read-all` → `200 {"unread_count": 0}`. Frontend Task 7 gọi đúng path này và đọc đúng key này.

- [ ] **Step 1: Viết test đỏ**

```python
    def test_read_all_clears_every_unread_row_of_the_caller_only(self):
        mine = Notification.objects.create(
            recipient=self.student, type="ASSIGNMENT_CREATED", title="Second unread", link="/x",
        )
        theirs = Notification.objects.create(
            recipient=self.other, type="ASSIGNMENT_CREATED", title="Theirs", link="/x",
        )
        response = self.authenticate(self.student).post("/api/notifications/read-all")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"unread_count": 0})
        self.unread.refresh_from_db(); mine.refresh_from_db(); theirs.refresh_from_db()
        self.assertIsNotNone(self.unread.read_at)
        self.assertIsNotNone(mine.read_at)
        self.assertIsNone(theirs.read_at)

    def test_read_all_is_idempotent_and_does_not_move_an_existing_read_at(self):
        client = self.authenticate(self.student)
        client.post("/api/notifications/read-all")
        first_read_at = Notification.objects.get(id=self.read.id).read_at
        self.assertEqual(client.post("/api/notifications/read-all").data, {"unread_count": 0})
        self.assertEqual(Notification.objects.get(id=self.read.id).read_at, first_read_at)

    def test_read_all_requires_authentication(self):
        self.assertEqual(APIClient().post("/api/notifications/read-all").status_code, 401)
```

- [ ] **Step 2: Chạy để xác nhận fail**

Run: `cd backend && python manage.py test notifications -v 2`
Expected: FAIL — `404` thay vì `200` (route chưa tồn tại).

- [ ] **Step 3: Viết view**

```python
# backend/notifications/views.py — thêm ở cuối file
class NotificationReadAllView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Một queryset update() thay vì loop POST /{id}/read: không nạp row nào,
        không có lỗi từng-row để hỏng nửa chừng. Mệnh đề WHERE đã mang guard
        read_at IS NULL nên không cần kiểm trong Python (07 §3)."""
        Notification.objects.filter(recipient=request.user, read_at__isnull=True).update(read_at=timezone.now())
        return Response({"unread_count": 0})
```

- [ ] **Step 4: Nối route**

```python
# backend/notifications/urls.py
from django.urls import path
from .views import NotificationReadAllView, NotificationReadView, NotificationsView
urlpatterns = [
    path("notifications", NotificationsView.as_view()),
    path("notifications/read-all", NotificationReadAllView.as_view()),
    path("notifications/<int:notification_id>/read", NotificationReadView.as_view()),
]
```

> `read-all` phải đứng **trước** route `<int:notification_id>` không bắt buộc về mặt kỹ thuật (`read-all` không phải `int`), nhưng giữ thứ tự này để người đọc không phải tự chứng minh điều đó.

- [ ] **Step 5: Chạy lại**

Run: `cd backend && python manage.py test notifications -v 2`
Expected: PASS toàn bộ.

- [ ] **Step 6: Commit**

```bash
git add backend/notifications
git commit -m "feat(notifications): add a bulk read-all endpoint"
```

### Task 5: Test fan-out từ hai call site

**Files:**
- Test: `backend/notifications/tests/test_notifications.py`

**Interfaces:**
- Consumes: `create_notifications(classroom, type, title, link)` từ `notifications/services.py`.
- Produces: không.

- [ ] **Step 1: Viết test**

```python
# thêm ở cuối backend/notifications/tests/test_notifications.py
from django.db import transaction

from classes.models import Class, Enrollment
from notifications.services import create_notifications, notify_user


class FanOutTests(TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user("t@example.test", "pw", role="TEACHER")
        self.enrolled = User.objects.create_user("a@example.test", "pw", role="STUDENT")
        self.disabled = User.objects.create_user("b@example.test", "pw", role="STUDENT")
        self.disabled.is_active = False
        self.disabled.save(update_fields=("is_active",))
        self.outsider = User.objects.create_user("c@example.test", "pw", role="STUDENT")
        self.class_ = Class.objects.create(
            name="Cohort 5", teacher=self.teacher,
            starts_at=timezone.now(), ends_at=timezone.now() + timezone.timedelta(days=30),
        )
        Enrollment.objects.create(classroom=self.class_, student=self.enrolled)
        Enrollment.objects.create(classroom=self.class_, student=self.disabled)

    def test_fan_out_reaches_the_whole_roster_including_disabled_accounts(self):
        create_notifications(self.class_, "ASSIGNMENT_CREATED", "New assignment: Lab 1", "/student/assignments/1")
        recipients = set(Notification.objects.values_list("recipient_id", flat=True))
        self.assertEqual(recipients, {self.enrolled.id, self.disabled.id})

    def test_a_student_enrolled_after_the_fan_out_gets_nothing_retroactively(self):
        create_notifications(self.class_, "ASSIGNMENT_CREATED", "New assignment: Lab 1", "/student/assignments/1")
        Enrollment.objects.create(classroom=self.class_, student=self.outsider)
        self.assertFalse(Notification.objects.filter(recipient=self.outsider).exists())

    def test_a_rolled_back_transaction_leaves_no_orphan_fan_out(self):
        try:
            with transaction.atomic():
                create_notifications(self.class_, "ASSIGNMENT_CREATED", "New assignment: Lab 1", "/student/assignments/1")
                raise RuntimeError("the domain write failed")
        except RuntimeError:
            pass
        self.assertFalse(Notification.objects.exists())

    def test_notify_user_writes_one_row_for_a_teacher_who_is_not_enrolled(self):
        notify_user(self.teacher, "CLASS_ASSIGNED", "Assigned to Cohort 5", f"/teacher/classes/{self.class_.id}")
        self.assertEqual(Notification.objects.filter(recipient=self.teacher).count(), 1)
```

> `Class` bắt buộc `teacher`, `name`, `starts_at`, `ends_at` (`description` là `blank=True`), nên `create(...)` ở trên là đủ — đã đối chiếu `backend/classes/models.py:5`.
> `timezone.timedelta` chạy được (Django re-export `datetime.timedelta`) nhưng các test hiện có trong repo dùng `from datetime import timedelta` — theo khuôn đó.

- [ ] **Step 2: Chạy**

Run: `cd backend && python manage.py test notifications -v 2`
Expected: PASS toàn bộ (đây là test đặc tả hành vi đã đúng — nếu đỏ nghĩa là code lệch spec, dừng lại và báo).

- [ ] **Step 3: Commit**

```bash
git add backend/notifications/tests/test_notifications.py
git commit -m "test(notifications): pin the roster fan-out and its transaction boundary"
```

### Task 5b: Thứ tự resource newest-first (N14)

**Files:**
- Modify: `backend/classes/views.py:316`
- Test: `backend/classes/tests/test_classes.py`

**Interfaces:**
- Produces: `GET /api/classes/{id}/resources` trả mới nhất trước. Task 9/10 dựa vào đúng thứ tự này khi assert "tài liệu vừa tạo nằm đầu danh sách".

- [ ] **Step 1: Viết test đỏ**

Thêm vào lớp test đã bao phủ `/resources` (tìm bằng `grep -n "resources" backend/classes/tests/test_classes.py`; nếu chưa có lớp nào, tạo test mới cạnh test `ClassResourcesView` gần nhất):

```python
    def test_resources_come_back_newest_first(self):
        for title in ("First", "Second", "Third"):
            ClassResource.objects.create(classroom=self.class_, title=title, description="", url="https://example.test/x")
        response = self.authenticate(self.teacher).get(f"/api/classes/{self.class_.id}/resources")
        self.assertEqual([row["title"] for row in response.data], ["Third", "Second", "First"])
```

- [ ] **Step 2: Chạy để xác nhận fail**

Run: `cd backend && python manage.py test classes -v 2`
Expected: FAIL — thứ tự trả về là insert order (`First, Second, Third`). Nếu PASS ngay: SQLite đang tình cờ trả đúng chiều ngược — vẫn làm Step 3, vì `ClassResource` không có `Meta.ordering` nên không có gì bảo đảm điều đó.

- [ ] **Step 3: Sửa view**

```python
# backend/classes/views.py — trong ClassResourcesView.get
        return Response(ClassResourceSerializer(classroom.resources.order_by("-id"), many=True).data)
```

> Sắp theo `-id` chứ không phải `-created_at`: `ClassResource` **không có** cột `created_at` (`classes/models.py:29`). Thêm cột chỉ để sắp xếp là một migration không cần thiết — id tự tăng đã là thứ tự chèn.

- [ ] **Step 4: Chạy lại**

Run: `cd backend && python manage.py test classes -v 2`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add backend/classes/views.py backend/classes/tests/test_classes.py
git commit -m "fix(resources): return class resources newest first"
```

---

## 5. Frontend

Chạy test: `cd frontend && npm test`. Type-check: `npm run build`.

### Task 6: Type, `relativeTime`, token và icon

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/format.ts`
- Modify: `frontend/src/components/Icon.tsx`
- Modify: `frontend/src/styles.css:3-15`
- Test: `frontend/src/test/lib/format.test.ts`

**Interfaces:**
- Produces:
  - `type NotificationType = "ASSIGNMENT_CREATED" | "RESOURCE_CREATED" | "CLASS_ASSIGNED" | "CLASS_UNASSIGNED" | (string & {})`
  - `interface Notification { id: number; type: NotificationType; title: string; link: string | null; created_at: string; read_at: string | null }`
  - `interface NotificationList { unread_count: number; items: Notification[] }`
  - `interface ClassResource { id: number; title: string; description: string; url: string }`
  - `relativeTime(value: string, now?: Date): string`
  - icon key `clipboard`
  - token `--color-accent`, `--color-primary-soft` (**không** thêm `--radius-md`/`--shadow-md`, xem D3)

- [ ] **Step 1: Viết test đỏ**

```ts
// thêm vào frontend/src/test/lib/format.test.ts
import { relativeTime } from "../../lib/format";

describe("relativeTime", () => {
  const now = new Date("2026-08-02T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("reads Vừa xong under a minute", () => {
    expect(relativeTime(ago(30_000), now)).toBe("Vừa xong");
  });

  it("counts minutes then hours", () => {
    expect(relativeTime(ago(5 * 60_000), now)).toBe("5 phút trước");
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe("3 giờ trước");
  });

  it("reads Hôm qua at one day and counts days up to a week", () => {
    expect(relativeTime(ago(26 * 3_600_000), now)).toBe("Hôm qua");
    expect(relativeTime(ago(3 * 86_400_000), now)).toBe("3 ngày trước");
  });

  it("falls back to dd/MM/yyyy from seven days out", () => {
    expect(relativeTime("2026-07-12T09:00:00Z", now)).toBe("12/07/2026");
  });
});
```

- [ ] **Step 2: Chạy để xác nhận fail**

Run: `cd frontend && npm test -- format`
Expected: FAIL — `relativeTime is not a function` / lỗi import.

- [ ] **Step 3: Viết `relativeTime`**

```ts
// thêm vào cuối frontend/src/lib/format.ts
const MINUTE = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

/** Mốc thời gian tương đối cho panel thông báo (07 §2.1). Tính client-side từ
 * created_at, nên không có gì để đồng bộ với server. */
export function relativeTime(value: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(value).getTime();
  if (elapsed < MINUTE) return "Vừa xong";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} phút trước`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} giờ trước`;
  const days = Math.floor(elapsed / DAY);
  if (days === 1) return "Hôm qua";
  if (days < 7) return `${days} ngày trước`;
  /** Nhánh cuối là đúng cái formatDate đã làm (Intl `en-GB` → dd/MM/yyyy) — dùng lại,
   * để một ngày đổi định dạng ngày thì chỉ phải đổi một chỗ. */
  return formatDate(value);
}
```

- [ ] **Step 4: Chạy lại**

Run: `cd frontend && npm test -- format`
Expected: PASS. `formatDate` đã ở ngay đầu file nên không cần import gì thêm.

- [ ] **Step 5: Thêm type**

```ts
// thêm vào cuối frontend/src/types.ts
/** `type` cố ý nới thành string: backend lưu CharField tự do, UI fallback về
 * icon chuông cho giá trị lạ (07 §4). */
export type NotificationType =
  | "ASSIGNMENT_CREATED" | "RESOURCE_CREATED" | "CLASS_ASSIGNED" | "CLASS_UNASSIGNED" | (string & {});

export interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  link: string | null;
  created_at: string;
  read_at: string | null;
}

export interface NotificationList {
  unread_count: number;
  items: Notification[];
}

export interface ClassResource {
  id: number;
  title: string;
  description: string;
  url: string;
}
```

- [ ] **Step 6: Thêm icon `clipboard`**

```tsx
// frontend/src/components/Icon.tsx — thêm vào object icon, cạnh bell
  clipboard: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></>,
```

- [ ] **Step 7: Thêm token**

```css
/* frontend/src/styles.css — trong @theme, cạnh --color-danger */
  --color-accent: #7C3AED;
  --color-primary-soft: #EFF6FF;
```

> Chỉ hai token màu. `--radius-md` / `--shadow-md` **không** được thêm: Tailwind v4 sinh utility từ chính các namespace đó (`rounded-md`, `shadow-md`), khai lại trong `@theme` là đổi ngầm toàn app (D3).

- [ ] **Step 8: Type-check + commit**

Run: `cd frontend && npm run build`
Expected: không lỗi TS.

```bash
git add frontend/src/types.ts frontend/src/lib/format.ts frontend/src/components/Icon.tsx frontend/src/styles.css frontend/src/test/lib/format.test.ts
git commit -m "feat(notifications): add the notification types, relative time and panel tokens"
```

### Task 7: `NotificationBell`

**Files:**
- Create: `frontend/src/components/NotificationBell.tsx`
- Test: `frontend/src/test/components/NotificationBell.test.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: `Notification`, `NotificationList` (Task 6), `relativeTime` (Task 6), `request` từ `lib/api`, `Icon`.
- Produces: `export function NotificationBell(): JSX.Element` — không nhận prop; Task 8 chỉ việc đặt vào `.header-actions`.

- [ ] **Step 1: Viết test đỏ**

```tsx
// frontend/src/test/components/NotificationBell.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { NotificationBell } from "../../components/NotificationBell";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});
const notification = (overrides = {}) => ({
  id: 1, type: "ASSIGNMENT_CREATED", title: "Bài tập mới: Homework 2",
  link: "/student/assignments/1", created_at: new Date().toISOString(), read_at: null, ...overrides,
});

function openShell(fetchMock: ReturnType<typeof vi.fn>) {
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><NotificationBell /></MemoryRouter>);
}

describe("Notification bell", () => {
  afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); });

  it("shows no badge until an unread count arrives", async () => {
    openShell(vi.fn().mockResolvedValue(json({ unread_count: 0, items: [] })));
    await userEvent.click(screen.getByRole("button", { name: /Thông báo/ }));
    await screen.findByText("Chưa có thông báo nào.");
    expect(screen.queryByTestId("notification-badge")).toBeNull();
  });

  it("fetches on open and lists items with a relative time", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ unread_count: 1, items: [notification()] }));
    openShell(fetchMock);
    await userEvent.click(screen.getByRole("button", { name: /Thông báo/ }));
    expect(await screen.findByText("Bài tập mới: Homework 2")).toBeTruthy();
    expect(screen.getByText("Vừa xong")).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/notifications");
  });

  it("renders a linkless row as text, not a link", async () => {
    openShell(vi.fn().mockResolvedValue(json({
      unread_count: 1,
      items: [notification({ type: "CLASS_UNASSIGNED", title: "Unassigned from Cohort 5", link: null })],
    })));
    await userEvent.click(screen.getByRole("button", { name: /Thông báo/ }));
    await screen.findByText("Unassigned from Cohort 5");
    expect(screen.queryByRole("link", { name: /Unassigned/ })).toBeNull();
  });

  it("marks everything read optimistically and clears the badge", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ unread_count: 2, items: [notification(), notification({ id: 2 })] }))
      .mockResolvedValueOnce(json({ unread_count: 0 }));
    openShell(fetchMock);
    await userEvent.click(screen.getByRole("button", { name: /Thông báo/ }));
    await screen.findByText("Bài tập mới: Homework 2");
    await userEvent.click(screen.getByRole("button", { name: "Đánh dấu đã đọc tất cả" }));
    await waitFor(() => expect(screen.queryByTestId("notification-badge")).toBeNull());
    expect(fetchMock.mock.calls[1][0]).toBe("/api/notifications/read-all");
  });

  it("rolls the badge back when read-all fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ unread_count: 2, items: [notification(), notification({ id: 2 })] }))
      .mockResolvedValueOnce(json({ detail: "boom" }, 500));
    openShell(fetchMock);
    await userEvent.click(screen.getByRole("button", { name: /Thông báo/ }));
    await screen.findByText("Bài tập mới: Homework 2");
    await userEvent.click(screen.getByRole("button", { name: "Đánh dấu đã đọc tất cả" }));
    expect(await screen.findByTestId("notification-badge")).toHaveTextContent("2");
  });

  it("keeps the loaded items and does not zero the badge when the fetch fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ unread_count: 1, items: [notification()] }))
      .mockResolvedValueOnce(json({ detail: "boom" }, 500));
    openShell(fetchMock);
    const bell = screen.getByRole("button", { name: /Thông báo/ });
    await userEvent.click(bell);
    await screen.findByText("Bài tập mới: Homework 2");
    await userEvent.click(bell);
    await userEvent.click(bell);
    expect(await screen.findByText("Không tải được thông báo.")).toBeTruthy();
    expect(screen.getByText("Bài tập mới: Homework 2")).toBeTruthy();
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("1");
  });

  it("closes on Escape and returns focus to the bell", async () => {
    openShell(vi.fn().mockResolvedValue(json({ unread_count: 0, items: [] })));
    const bell = screen.getByRole("button", { name: /Thông báo/ });
    await userEvent.click(bell);
    await screen.findByText("Chưa có thông báo nào.");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Chưa có thông báo nào.")).toBeNull());
    expect(document.activeElement).toBe(bell);
  });
});
```

- [ ] **Step 2: Chạy để xác nhận fail**

Run: `cd frontend && npm test -- NotificationBell`
Expected: FAIL — không resolve được `../../components/NotificationBell`.

- [ ] **Step 3: Viết component**

```tsx
// frontend/src/components/NotificationBell.tsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { request } from "../lib/api";
import { relativeTime } from "../lib/format";
import type { Notification, NotificationList } from "../types";
import { Icon } from "./Icon";

/** type là CharField tự do ở backend (07 §4), nên map này luôn phải có đường lui. */
const TYPE_ICON: Record<string, { name: "clipboard" | "bookOpen" | "users" | "bell"; tone: "primary" | "accent" }> = {
  ASSIGNMENT_CREATED: { name: "clipboard", tone: "primary" },
  RESOURCE_CREATED: { name: "bookOpen", tone: "accent" },
  CLASS_ASSIGNED: { name: "users", tone: "primary" },
  CLASS_UNASSIGNED: { name: "users", tone: "primary" },
};
const iconFor = (type: string) => TYPE_ICON[type] ?? { name: "bell" as const, tone: "primary" as const };
const token = () => sessionStorage.getItem("access_token") ?? undefined;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [failure, setFailure] = useState("");
  const bell = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = () => { setOpen(false); bell.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    /** Chỉ fetch khi mở: không polling, không websocket (07 §2.1). */
    setFailure("");
    request<NotificationList>("/notifications", { token: token() })
      .then((value) => { if (!value) return; setItems(value.items); setUnread(value.unread_count); })
      /** Lỗi mạng không phải bằng chứng là đã đọc — giữ nguyên badge và danh sách cũ. */
      .catch(() => setFailure("Không tải được thông báo."));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !bell.current?.contains(target)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);

  const markOne = (notification: Notification) => {
    if (notification.read_at) return;
    const previous = { items, unread };
    setItems((rows) => rows.map((row) => row.id === notification.id ? { ...row, read_at: new Date().toISOString() } : row));
    setUnread((count) => Math.max(0, count - 1));
    request(`/notifications/${notification.id}/read`, { method: "POST", token: token() })
      .catch(() => { setItems(previous.items); setUnread(previous.unread); });
  };

  const markAll = () => {
    const previous = { items, unread };
    const now = new Date().toISOString();
    setItems((rows) => rows.map((row) => row.read_at ? row : { ...row, read_at: now }));
    setUnread(0);
    request("/notifications/read-all", { method: "POST", token: token() })
      .catch(() => { setItems(previous.items); setUnread(previous.unread); });
  };

  return <div className="notification-bell">
    <button
      ref={bell}
      type="button"
      className="notification-trigger"
      aria-expanded={open}
      aria-controls="notif-panel"
      aria-label={unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
      onClick={() => setOpen((value) => !value)}
    >
      <Icon name="bell" />
      {/* Badge rỗng đọc như một cái bug — không render khi bằng 0 (07 §2.1). */}
      {unread > 0 && <span className="notification-badge" data-testid="notification-badge">{unread > 99 ? "99+" : unread}</span>}
    </button>
    {open && <div id="notif-panel" ref={panel} className="notification-panel">
      <div className="notification-panel-head">
        <strong>Thông báo</strong>
        <button type="button" className="link-button" disabled={unread === 0} onClick={markAll}>Đánh dấu đã đọc tất cả</button>
      </div>
      {failure && <p className="notification-failure">{failure}</p>}
      {items.length === 0 && !failure
        ? <p className="notification-empty">Chưa có thông báo nào.</p>
        : <ul className="notification-list">
          {items.map((item) => {
            const icon = iconFor(item.type);
            const body = <>
              <span className={`notification-icon tone-${icon.tone}`}><Icon name={icon.name} /></span>
              <span className="notification-text">
                <span className="notification-title">{item.title}</span>
                <span className="notification-time">{relativeTime(item.created_at)}</span>
              </span>
            </>;
            return <li key={item.id} className={item.read_at ? "notification-item" : "notification-item unread"}>
              {!item.read_at && <span className="notification-dot" aria-hidden="true" />}
              {item.link
                ? <Link className="notification-row" to={item.link} onClick={() => { markOne(item); setOpen(false); }}>{body}</Link>
                /** link = null (CLASS_UNASSIGNED): vẫn đánh dấu đã đọc, không điều hướng. */
                : <button type="button" className="notification-row" onClick={() => markOne(item)}>{body}</button>}
            </li>;
          })}
        </ul>}
    </div>}
  </div>;
}
```

- [ ] **Step 4: Thêm CSS**

```css
/* frontend/src/styles.css — thêm cạnh khối .header-actions */
.notification-bell { position: relative; }
.notification-trigger { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border: 1px solid var(--color-border); border-radius: .35rem; background: transparent; color: var(--color-muted); cursor: pointer; }
.notification-badge { position: absolute; top: -.25rem; right: -.25rem; min-width: 1.25rem; padding: 0 .25rem; border-radius: 999px; background: var(--color-accent); color: #fff; font-size: .7rem; line-height: 1.25rem; text-align: center; }
/* z-index 15: trên .action-menu-panel (10), dưới .drawer-backdrop (20) và .sidebar (21)
   để drawer mobile vẫn thắng. Radius/shadow khớp .action-menu-panel — cùng idiom dropdown. */
.notification-panel { position: absolute; right: 0; top: 100%; z-index: 15; width: 22rem; max-width: calc(100vw - 1rem); max-height: 24rem; overflow-y: auto; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: .5rem; box-shadow: 0 4px 12px #0f172a20; }
.notification-panel-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .75rem; border-bottom: 1px solid var(--color-border); }
.notification-list { list-style: none; margin: 0; padding: 0; }
.notification-item { position: relative; border-bottom: 1px solid var(--color-border); }
.notification-item.unread { background: var(--color-primary-soft); }
.notification-dot { position: absolute; left: .4rem; top: 1.1rem; width: .4rem; height: .4rem; border-radius: 999px; background: var(--color-accent); }
.notification-row { display: flex; gap: .5rem; width: 100%; padding: .75rem .75rem .75rem 1.1rem; border: 0; background: transparent; text-align: left; color: inherit; cursor: pointer; }
.notification-icon.tone-primary { color: var(--color-primary); }
.notification-icon.tone-accent { color: var(--color-accent); }
.notification-text { display: flex; flex-direction: column; gap: .15rem; min-width: 0; }
.notification-title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.notification-time, .notification-empty, .notification-failure { color: var(--color-muted); font-size: .85rem; }
.notification-empty, .notification-failure { padding: .75rem; margin: 0; }
@media (max-width: 479px) { .notification-panel { position: fixed; left: .5rem; right: .5rem; width: auto; } }
```

> `.link-button` **chưa tồn tại** trong `styles.css` (đã kiểm) — thêm: `.link-button { min-height: auto; min-width: auto; border: 0; background: transparent; color: var(--color-primary); cursor: pointer; } .link-button:disabled { color: var(--color-muted); cursor: default; }`. `min-height/min-width: auto` là bắt buộc: reset toàn cục đặt `button { min-height: 44px; min-width: 44px }` (`styles.css:25-26`), để nguyên thì nút text trong header panel bị phình.
> `.notification-trigger` là bản thay thế của `.notification-link` (`styles.css:74`) — **sửa tại chỗ**, đừng để hai rule cùng nội dung; Task 8 xoá nốt phần còn lại nếu sót.

- [ ] **Step 5: Chạy lại**

Run: `cd frontend && npm test -- NotificationBell`
Expected: PASS cả 7 test.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/NotificationBell.tsx frontend/src/styles.css frontend/src/test/components/NotificationBell.test.tsx
git commit -m "feat(notifications): add the bell and its dropdown panel"
```

### Task 8: Gắn chuông vào AppShell, bỏ route placeholder (D2)

**Files:**
- Modify: `frontend/src/components/AppShell.tsx:79`
- Modify: `frontend/src/App.tsx:66`
- Test: `frontend/src/test/App.test.tsx`

**Interfaces:**
- Consumes: `NotificationBell` (Task 7).
- Produces: không còn route `/notifications` — bất kỳ link cũ nào tới đó sẽ rơi vào `NotFoundPage`.

- [ ] **Step 1: Sửa test nav sẵn có (N15) + viết test đỏ**

`App.test.tsx:46-49` đang khẳng định điều ngược lại với việc sắp làm:

```tsx
  it.each([
    ["ADMIN", ["Dashboard", "Accounts", "Classes", "Audit"]],
    ["TEACHER", ["Dashboard", "My Classes", "Notifications"]],   // <- "Notifications" là <Link aria-label> của chuông cũ
    ["STUDENT", ["Dashboard", "My Classes", "Notifications"]],
  ] as const)
```

Bỏ `"Notifications"` khỏi hai dòng TEACHER/STUDENT — bảng đó liệt kê **link điều hướng**, và chuông mới là `<button>`, không phải link. Rồi thêm test mới trong cùng `describe`:

```tsx
  it("shows the notification bell in the shell header for a student and drops the /notifications link", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "STUDENT", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }), { headers: { "Content-Type": "application/json" } })));

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
    expect(screen.getByRole("button", { name: /Thông báo/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Notifications" })).toBeNull();
  });

  it("hides the bell for an admin", async () => {
    // như trên nhưng role: "ADMIN"
    expect(screen.queryByRole("button", { name: /Thông báo/ })).toBeNull();
  });
```

> Stub `fetch` ở đây trả về profile cho **mọi** request, kể cả `/api/notifications` — chấp nhận được vì hai test này không mở panel. Test hành vi panel nằm ở Task 7, trên component đứng riêng.

- [ ] **Step 2: Chạy để xác nhận fail**

Run: `cd frontend && npm test -- App`
Expected: FAIL ở hai test mới (không có button `Thông báo`; và với STUDENT thì `<Link aria-label="Notifications">` vẫn còn ở `AppShell.tsx:75`). `it.each` vừa sửa vẫn xanh — nó chỉ khẳng định link nào *phải có*, không khẳng định link nào *không được có*, nên việc bỏ `"Notifications"` khỏi bảng là dọn trước để Step 3 không làm nó đỏ.

- [ ] **Step 3: Thay link bằng chuông**

```tsx
// frontend/src/components/AppShell.tsx — import
import { NotificationBell } from "./NotificationBell";
```

```tsx
// frontend/src/components/AppShell.tsx — trong .header-actions, thay <Link className="notification-link" .../>
        <div className="header-actions">
          {user?.role !== "ADMIN" && <NotificationBell />}
          <UserMenu />
        </div>
```

> Spec §2.1: chuông chỉ hiện cho Teacher/Student, Admin không có. Admin không bao giờ là recipient của bất kỳ `type` nào (07 §5).

- [ ] **Step 4: Bỏ route placeholder**

```tsx
// frontend/src/App.tsx — xoá dòng
      <Route path="/notifications" element={<Placeholder title="Notifications" />} />
```

> `Placeholder` vẫn còn được route `/audit` dùng — chỉ xoá khi [plan 08](08-audit-log-plan.md) Task 4 thay nốt route đó, lúc ấy xoá luôn cả hàm.

- [ ] **Step 5: Chạy lại**

Run: `cd frontend && npm test && npm run build`
Expected: PASS toàn bộ test, build không lỗi TS. Xoá `.notification-link` khỏi `styles.css` nếu không còn chỗ nào tham chiếu (`grep -rn "notification-link" frontend/src`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/AppShell.tsx frontend/src/App.tsx frontend/src/styles.css frontend/src/test/App.test.tsx
git commit -m "feat(notifications): put the bell in the shell header and drop the placeholder route"
```

### Task 9: `ClassResources` + tab Student (N9, N10)

**Files:**
- Create: `frontend/src/components/ClassResources.tsx`
- Modify: `frontend/src/pages/student/StudentClassPage.tsx:56`
- Test: `frontend/src/test/components/ClassResources.test.tsx`
- Test: `frontend/src/test/pages/StudentClassPage.test.tsx`

**Interfaces:**
- Consumes: `ClassResource` (Task 6), `request`.
- Produces: `export function ClassResources({ classId }: { classId: number }): JSX.Element` — Task 10 dùng lại y nguyên component này.

- [ ] **Step 1: Viết test đỏ**

```tsx
// frontend/src/test/components/ClassResources.test.tsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClassResources } from "../../components/ClassResources";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});

describe("Class resources", () => {
  afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); });

  it("lists each resource as an external link with its description", async () => {
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([
      { id: 1, title: "Slide deck", description: "Week 1 slides", url: "https://example.test/slides" },
      { id: 2, title: "Reference repo", description: "", url: "https://example.test/repo" },
    ])));
    render(<ClassResources classId={9} />);
    const link = await screen.findByRole("link", { name: /Slide deck/ });
    expect(link).toHaveAttribute("href", "https://example.test/slides");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByText("Week 1 slides")).toBeTruthy();
  });

  it("shows an empty state when the class has no resources", async () => {
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    render(<ClassResources classId={9} />);
    expect(await screen.findByText("Chưa có tài liệu nào.")).toBeTruthy();
  });

  it("surfaces a load failure instead of an empty list", async () => {
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "boom" }, 500)));
    render(<ClassResources classId={9} />);
    expect(await screen.findByText("Không tải được tài liệu.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Chạy để xác nhận fail**

Run: `cd frontend && npm test -- ClassResources`
Expected: FAIL — không resolve được module.

- [ ] **Step 3: Viết component**

```tsx
// frontend/src/components/ClassResources.tsx
import { useEffect, useState } from "react";

import { request } from "../lib/api";
import type { ClassResource } from "../types";
import { Alert } from "./Alert";
import { EmptyState } from "./EmptyState";
import { Spinner } from "./Spinner";

/** Hiển thị dùng chung cho tab Student và tab Teacher (07 §2.2, §2.3).
 * `reloadKey` để màn hình nhúng ép nạp lại sau khi tạo resource mới. */
export function ClassResources({ classId, reloadKey = 0 }: { classId: number; reloadKey?: number }) {
  const [resources, setResources] = useState<ClassResource[]>();
  const [failure, setFailure] = useState("");
  useEffect(() => {
    setFailure("");
    request<ClassResource[]>(`/classes/${classId}/resources`, { token: sessionStorage.getItem("access_token") ?? undefined })
      .then((value) => value && setResources(value))
      .catch(() => { setFailure("Không tải được tài liệu."); setResources([]); });
  }, [classId, reloadKey]);
  if (failure) return <Alert>{failure}</Alert>;
  if (!resources) return <Spinner label="Loading resources" />;
  if (resources.length === 0) return <EmptyState>Chưa có tài liệu nào.</EmptyState>;
  return <ul className="resource-list">
    {resources.map((resource) => <li key={resource.id}>
      {/* URL do giáo viên tự nhập, lưu nguyên văn, không fetch/preview (07 §6). */}
      <a href={resource.url} target="_blank" rel="noopener noreferrer">{resource.title}</a>
      {resource.description && <p className="muted">{resource.description}</p>}
    </li>)}
  </ul>;
}
```

> `.resource-list` chưa có trong `styles.css` — thêm cạnh khối `.page-stack`: `.resource-list { list-style: none; margin: 0; padding: 0; display: grid; gap: .75rem; } .resource-list a { color: var(--color-primary); } .resource-list p { margin: .15rem 0 0; }`.
> `EmptyState` chỉ nhận `children: string` (`components/EmptyState.tsx`) — không truyền element vào.

- [ ] **Step 4: Nối vào tab Student**

```tsx
// frontend/src/pages/student/StudentClassPage.tsx — import
import { ClassResources } from "../../components/ClassResources";
```

```tsx
// thay dòng 56
    {tab === "resources" && <Card><ClassResources classId={Number(classId)} /></Card>}
```

- [ ] **Step 5: Thêm test trang Student**

```tsx
// thêm vào frontend/src/test/pages/StudentClassPage.test.tsx
  it("lists class resources in the resources tab", async () => {
    openPage(vi.fn()
      .mockResolvedValueOnce(json(classDetail()))
      .mockResolvedValueOnce(json([{ id: 1, title: "Slide deck", description: "Week 1 slides", url: "https://example.test/s" }])));
    expect(await screen.findByRole("link", { name: /Slide deck/ })).toBeTruthy();
  });
```

- [ ] **Step 6: Chạy lại**

Run: `cd frontend && npm test -- ClassResources StudentClassPage`
Expected: PASS toàn bộ.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ClassResources.tsx frontend/src/pages/student/StudentClassPage.tsx frontend/src/test
git commit -m "feat(resources): list class resources in the student class tab"
```

### Task 10: Tab resource + form tạo cho Teacher (D4)

**Files:**
- Modify: `frontend/src/pages/teacher/TeacherClassPage.tsx`
- Test: `frontend/src/test/pages/TeacherClassPage.test.tsx`

**Interfaces:**
- Consumes: `ClassResources` (Task 9), `Field`, `Button`, `Card`, `Alert` từ `components/`.
- Produces: không có export mới.

- [ ] **Step 1: Đọc trang trước khi sửa**

Run: `sed -n '1,45p' frontend/src/pages/teacher/TeacherClassPage.tsx`
Trang đã có cơ chế tab qua `?tab=`, nhưng whitelist là **đóng** (N16):

```tsx
  const requestedTab = searchParams.get("tab");
  const tab = requestedTab === "assignments" || requestedTab === "gradebook" ? requestedTab : "students";
```

`?tab=resources` hôm nay rơi về `students`. Không dựng cơ chế tab thứ hai — chỉ mở rộng whitelist này.

- [ ] **Step 2: Viết test đỏ**

```tsx
// thêm vào frontend/src/test/pages/TeacherClassPage.test.tsx
  it("creates a resource and reloads the list", async () => {
    // fetch: 1) class detail  2) GET resources (rỗng)  3) POST resource  4) GET resources (1 dòng)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ id: 1, title: "Slide deck", description: "", url: "https://example.test/s" }, 201))
      .mockResolvedValueOnce(json([{ id: 1, title: "Slide deck", description: "", url: "https://example.test/s" }]));
    openPage(fetchMock, "?tab=resources");
    await userEvent.type(await screen.findByLabelText("Title"), "Slide deck");
    await userEvent.type(screen.getByLabelText("URL"), "https://example.test/s");
    await userEvent.click(screen.getByRole("button", { name: "Tạo tài liệu" }));
    expect(await screen.findByRole("link", { name: /Slide deck/ })).toBeTruthy();
    const [path, init] = fetchMock.mock.calls[2];
    expect(path).toBe("/api/classes/9/resources");
    expect(init.method).toBe("POST");
  });

  it("shows the server validation message when the URL is rejected", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ url: ["Enter a valid URL."] }, 422));
    openPage(fetchMock, "?tab=resources");
    await userEvent.type(await screen.findByLabelText("Title"), "Bad");
    await userEvent.type(screen.getByLabelText("URL"), "not-a-url");
    await userEvent.click(screen.getByRole("button", { name: "Tạo tài liệu" }));
    expect(await screen.findByText("Enter a valid URL.")).toBeTruthy();
  });
```

> Trong file test này `classDetail` là **object**, không phải factory (khác `StudentClassPage.test.tsx`) — dùng `json(classDetail)`, không `json(classDetail())`.
> `openPage` chưa nhận query — mở rộng helper sẵn có để `initialEntries` thành `/teacher/classes/9${search ?? ""}`, đừng viết helper mới. Trang được bọc `ToastProvider` trong helper đó, giữ nguyên.
> Label tiếng Anh (`Title`, `URL`) là cố ý — khớp form assignment ngay trên cùng trang (D5).

- [ ] **Step 3: Chạy để xác nhận fail**

Run: `cd frontend && npm test -- TeacherClassPage`
Expected: FAIL — không tìm thấy label `Title` của form resource (tab rơi về `students`).

- [ ] **Step 4: Mở whitelist tab + thêm nút tab**

```tsx
// frontend/src/pages/teacher/TeacherClassPage.tsx
  const tab = requestedTab === "assignments" || requestedTab === "gradebook" || requestedTab === "resources" ? requestedTab : "students";
```

```tsx
// trong <div className="tabs" role="tablist">, sau nút Bảng điểm
      <button type="button" className="tab" role="tab" aria-selected={tab === "resources"} onClick={() => setSearchParams({ tab: "resources" })}>Class resources</button>
```

> Nhãn tab `Class resources` khớp đúng nhãn tab bên Student (`StudentClassPage.tsx:54`) — cùng một thứ thì cùng một tên.

- [ ] **Step 5: Thêm form**

```tsx
// import — Field, Textarea, Button, Card, ApiFailure, request đã được import sẵn ở trang này
import { ClassResources } from "../../components/ClassResources";
```

```tsx
// state cạnh các state hiện có của trang
  const [resourceForm, setResourceForm] = useState({ title: "", description: "", url: "" });
  const [resourceErrors, setResourceErrors] = useState<FieldErrors>({});
  const [resourceBusy, setResourceBusy] = useState(false);
  const [resourceReload, setResourceReload] = useState(0);

  async function submitResource(event: FormEvent) {
    event.preventDefault();
    setResourceErrors({});
    setResourceBusy(true);
    try {
      /** Resource cố ý không theo lifecycle của assignment: không kiểm is_open,
       * không hạn — đăng tài liệu cho một lớp đã kết thúc là chuyện bình thường (07 §2.3). */
      await request(`/classes/${classId}/resources`, { method: "POST", token: token(), body: resourceForm });
      setResourceForm({ title: "", description: "", url: "" });
      setResourceReload((value) => value + 1);
    } catch (error) {
      if (error instanceof ApiFailure && error.fields) setResourceErrors(error.fields);
      else toast.error(error instanceof Error ? error.message : "Unable to add resource.");
    } finally {
      setResourceBusy(false);
    }
  }
```

```tsx
// nhánh render, cạnh các tab hiện có
    {tab === "resources" && <Card>
      <form noValidate className="form-grid" onSubmit={submitResource}>
        <Field id="resource-title" label="Title" required wide value={resourceForm.title} error={resourceErrors.title?.[0]}
          onChange={(event) => setResourceForm({ ...resourceForm, title: event.target.value })} />
        <Textarea id="resource-description" label="Description" wide rows={3} value={resourceForm.description} error={resourceErrors.description?.[0]}
          onChange={(event) => setResourceForm({ ...resourceForm, description: event.target.value })} />
        <Field id="resource-url" label="URL" required wide value={resourceForm.url} error={resourceErrors.url?.[0]}
          onChange={(event) => setResourceForm({ ...resourceForm, url: event.target.value })} />
        <div className="form-actions field-full"><Button type="submit" disabled={resourceBusy}>{resourceBusy ? "Saving…" : "Tạo tài liệu"}</Button></div>
      </form>
      <ClassResources classId={Number(classId)} reloadKey={resourceReload} />
    </Card>}
```

> Khuôn này sao chép form assignment ngay phía dưới trong cùng file: `noValidate`, `className="form-grid"`, `error={errors.x?.[0]}`, `disabled={busy}` với nhãn `Saving…`, lỗi không-theo-field đẩy vào `toast.error`. `Field.error` là **một chuỗi**, không phải mảng (`components/Field.tsx:19`); `description` dùng `Textarea` vì cột là `TextField(max_length=1000)`.
> `FieldErrors`, `FormEvent`, `token()` và `toast` đều đã tồn tại trong file — không khai lại.

- [ ] **Step 6: Chạy lại**

Run: `cd frontend && npm test -- TeacherClassPage && npm run build`
Expected: PASS, build sạch.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/teacher/TeacherClassPage.tsx frontend/src/test/pages/TeacherClassPage.test.tsx
git commit -m "feat(resources): let a teacher add class resources from the class page"
```

---

## 6. Task 11: Kiểm lại spec sau khi code xong

Spec đã được sửa **trước** khi plan chạy, nên đây không còn là task viết lại — chỉ là đối chiếu cuối cùng giữa `docs/overview/07-notifications-and-resources.md` và thứ vừa ship.

**Files:**
- Verify (sửa nếu lệch): `docs/overview/07-notifications-and-resources.md`

- [ ] **Step 1: Đối chiếu §2.1**

| Spec nói | Kiểm bằng |
|---|---|
| Shell `.app-shell > aside.sidebar + main.canvas > header > .header-actions`, chuông thay `notification-link` | `grep -n "header-actions\|NotificationBell" frontend/src/components/AppShell.tsx` |
| Panel `z-index: 15`, radius `.5rem`, shadow `0 4px 12px #0f172a20` | `grep -n "notification-panel" frontend/src/styles.css` |
| Đúng hai token mới, **không** có `--radius-md`/`--shadow-md` | `grep -n "color-accent\|primary-soft\|radius-md\|shadow-md" frontend/src/styles.css` |
| `Notification` có đủ 6 field + `NotificationList` | `grep -n "interface Notification" -A 10 frontend/src/types.ts` |

- [ ] **Step 2: Đối chiếu §2.2 / §2.3 / §3 / §4**

- resource newest first → `grep -n 'order_by("-id")' backend/classes/views.py`
- tab teacher `?tab=resources` → `grep -n "resources" frontend/src/pages/teacher/TeacherClassPage.tsx`
- `read-all` có route → `grep -n "read-all" backend/notifications/urls.py`
- `link` nullable → `grep -n "link" backend/notifications/models.py`

Chỗ nào lệch: sửa spec nếu code đúng ý đồ, sửa code nếu không — đừng để nguyên.

- [ ] **Step 3: Commit (chỉ khi có sửa)**

```bash
git add docs/overview/07-notifications-and-resources.md
git commit -m "docs(07): correct the spec against the shipped notification bell"
```

---

## 7. Verify toàn bộ

- [ ] `cd backend && python manage.py test` — toàn bộ suite xanh.
- [ ] `cd frontend && npm test` — toàn bộ suite xanh.
- [ ] `cd frontend && npm run build` — không lỗi TS.
- [ ] Chạy tay: đăng nhập Teacher → tạo assignment → đăng nhập Student trong lớp đó → badge hiện `1` → mở panel → click row → tới `/student/assignments/{id}` → mở lại panel, badge biến mất.
- [ ] Chạy tay: Admin đổi giáo viên của một Class → giáo viên cũ thấy row `CLASS_UNASSIGNED` không click được; giáo viên mới thấy row `CLASS_ASSIGNED` click vào mở được Class.
- [ ] Chạy tay: Teacher mở tab "Class resources" → tạo 2 tài liệu → tài liệu mới nhất nằm đầu danh sách; Student trong lớp mở tab resources thấy đúng 2 dòng và có badge `RESOURCE_CREATED`.
- [ ] Chạy tay: đăng nhập Admin → header **không** có chuông.
- [ ] Chạy tay ở khổ mobile (<1024px): mở drawer sidebar trong khi panel thông báo đang mở → drawer nằm trên panel (z-index 21 > 15), không bị panel che.

---

## 8. Không làm (và lý do)

| Việc | Lý do |
|---|---|
| Phân trang `?limit=20` cho `/api/notifications` | Spec §2.1 ghi rõ là `ponytail:` — panel scroll được, chưa có tài khoản thật nào đủ dài |
| Tab All/Unread | Nền `unread` đã mang thông tin đó (§2.1) |
| Xoá / dismiss notification | `read_at` là transition duy nhất (§5) |
| Polling / websocket | Chỉ fetch khi mở panel (§2.1); sự kiện vài lần một tuần |
| `DUE_DATE_CHANGED`, `GRADE_CREATED` | Cả hai là `ponytail:` trong §5.1 — thêm khi có người yêu cầu |
| `write_audit` cho resource creation | Thuộc [plan 08](08-audit-log-plan.md) Task 2 |
| Sửa/xoá resource | Không có endpoint, không có trong spec |
