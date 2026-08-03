# Plan: Audit Log (docs/overview/08-audit-log.md)

> **For agentic workers:** REQUIRED SUB-SKILL: dùng `superpowers:subagent-driven-development` (khuyến nghị) hoặc `superpowers:executing-plans` để chạy plan này theo từng task. Các bước dùng cú pháp checkbox (`- [ ]`).

**Goal:** Biến `GET /api/audit-logs` từ một mảng JSON thô (`action`, `target_type`, `target_id`) thành màn hình Admin đọc được đúng như spec §2.1, và bịt lỗ `class_resource.created`.

**Architecture:** Backend append-only đã đúng và đã có test; 22/23 action trong spec đã được ghi. Việc còn lại là (1) một action còn thiếu, (2) một tầng phân giải `target_id → tên người/lớp/bài` chạy **theo lô ở server** (`audit/labels.py`) để frontend không phải gọi thêm API nào, (3) `AuditLogPage` render bảng và map `action` → câu tiếng Việt, với đường lui in nguyên mã khi gặp action lạ.

**Tech Stack:** Django 5 + DRF (`backend/audit`, `backend/classes`), React 19 + Vite + TypeScript (`frontend/src`), test: `python manage.py test`, `npm test`.

## Global Constraints

- Append-only là bất khả xâm phạm: `AuditLogQuerySet.update()/.delete()`, `AuditLog.save()` khi đã có `pk`, và `AuditLog.delete()` đều `raise RuntimeError`. Không thêm đường ghi đè nào.
- `safe_metadata` **loại mọi chuỗi** — metadata chỉ chứa số/bool/list/dict. Không bao giờ đưa tên, email, tiêu đề vào `metadata`.
- Mọi `write_audit` nằm trong `transaction.atomic()` của view gọi nó.
- `GET /api/audit-logs` chỉ Admin (`IsAdmin`); role khác `403`, chưa đăng nhập `401`.
- Không sửa file ngoài phạm vi feature này; `docs/overview/08-audit-log.md` chỉ sửa ở Task 6.

Trạng thái audit: 2026-08-02, branch `feature/improve_ui` @ `72ec5a0`.

---

## 0. Kết luận nhanh

| Mảng | Trạng thái |
|---|---|
| Bảng `audit_logs`, ràng buộc append-only, `PROTECT` trên actor | **Có, đúng spec §4** |
| `write_audit` + `safe_metadata` + `_safe_value` | **Có, đúng spec §5** |
| 22 action trong bảng spec §4 | **Đã ghi đủ 22** — đã đối chiếu từng `write_audit` trong code |
| `class_resource.created` | **Thiếu** — đúng như spec §5.1 tự nhận |
| `GET /api/audit-logs` Admin-only, `-created_at, -id` | **Có** (ordering nằm ở `Meta.ordering`) |
| Phân giải `target_id` → tên | **Không có** — serializer trả `target_type` + `target_id` trần |
| `AuditLogPage` | **Không tồn tại** — route `/audit` render `<Placeholder title="Audit" />` |
| Test backend | **Có 7 test** cho append-only, scrubber, quyền — không có test nào cho nhãn/target |

Khối lượng ước tính: ~0.5 ngày backend, ~0.5 ngày frontend.

---

## 1. Audit: spec vs code

| # | Spec | Code hiện tại | File | Mức |
|---|---|---|---|---|
| A1 | UI phân giải `target_id` thành tên ("Student Tran Minh Anh", "Web Development K18A", "Lab 3 - Tran Minh Anh 85/100") (§2.1) | Serializer trả `target_type: "accounts.user", target_id: 7` — frontend không có cách nào biến nó thành tên mà không N+1 | `audit/serializers.py` | Cao |
| A2 | `class_resource.created` cần được thêm (§5.1) | `ClassResourcesView.post` chỉ gọi `create_notifications`, không `write_audit` | `classes/views.py:322` | Cao |
| A3 | `enrollment.replaced` mang **counts** thêm/bớt trong metadata (§2.1) | Mang `{"class_id": ..., "student_ids": [sorted ids]}` — danh sách id, không phải count | `classes/views.py:296` | Cần quyết định |
| A4 | Action lạ render nguyên mã dotted, không bị ẩn (§2.1) | Không có UI nào để mà ẩn hay hiện | `App.tsx:73` | Cao |
| A5 | Màn hình `/admin/audit-logs` (§2.1) | Route là `/audit`, và trỏ vào `Placeholder` | `App.tsx:73`, `AppShell.tsx:68` | Cần quyết định |
| A6 | `class.status_changed` render Enabled/Disabled theo `metadata.is_active` (§2.1) | Backend đã ghi `{"is_active": bool}` ✔, chưa có UI đọc | `classes/views.py:136` | Cao |
| A7 | — | `enrollment.removed` ghi audit **rồi xoá** `Enrollment` → `target_id` trỏ vào row đã biến mất | `classes/views.py:262-264` | Cao (ảnh hưởng A1) |
| A8 | Trả full list, newest first (§3) | ✔ Đúng, `Meta.ordering = ("-created_at", "-id")` | `audit/models.py:47` | OK |
| A9 | Metadata mang ID/count chứ không mang giá trị trước/sau (§5.2) | ✔ Đúng, là hạn chế đã biết và có chủ ý | — | OK, không sửa |

Điểm **đúng spec, không đụng vào**: ba tầng chặn append-only; `actor` `PROTECT`; serializer chạy `safe_metadata` **lần nữa** lúc đọc (chặn cả row cũ ghi trước khi scrubber tồn tại); `AuditLogSerializer.get_actor` trả `{id, full_name, email}`; không audit read/download.

### A7 — chi tiết, vì nó quyết định thiết kế A1

```python
# classes/views.py:262
        with transaction.atomic():
            write_audit(actor=request.user, action="enrollment.removed", target=enrollment, metadata={...})
            enrollment.delete()
```

Row audit trỏ tới `classes.enrollment#N` mà `N` không còn tồn tại ngay sau khi transaction commit. Bất kỳ cách phân giải nào dựa **thuần** vào `(target_type, target_id)` cũng sẽ trả rỗng cho mọi dòng `enrollment.removed` — tức là đúng cái dòng mà admin cần đọc nhất. Đây là lý do tầng phân giải ở Task 3 ưu tiên `metadata` (`class_id`, `student_id`) và chỉ dùng `target_id` khi metadata không có gì.

Không sửa thứ tự write/delete: audit ghi trước khi xoá là đúng, và làm cho `target_id` "sống" lại đòi một bảng lưu tên — chi phí lớn hơn giá trị.

---

## 2. Quyết định cần chốt trước khi code

### Q1 — Phân giải nhãn ở server, không ở client

Ba phương án:

| | Cách làm | Đánh giá |
|---|---|---|
| a | Frontend gọi `/api/users`, `/api/classes`, `/api/assignments` rồi tự join | 3+ request, mỗi cái có phân trang riêng, và Admin **không** có endpoint list assignment toàn hệ thống → không khả thi |
| b | Serializer resolve từng row | N+1 nặng: log 500 dòng = 500 query |
| c | **View gom rows → 4 truy vấn theo lô → dict `{log_id: label}` → context của serializer** | 4 query cố định bất kể số dòng; frontend chỉ đọc một trường |

**Đề xuất: (c)**, đặt trong module mới `audit/labels.py` để `views.py` giữ nguyên độ mỏng. Serializer thêm trường đọc-thêm `target_label: string`.

### Q2 — `enrollment.replaced` metadata: counts hay id list?

Spec §2.1 nói metadata mang "added/removed counts". Code ghi `{"class_id", "student_ids": [...]}` — danh sách id đầy đủ, vẫn qua được scrubber (toàn số), và cho phép tái dựng roster tại thời điểm đó chứ không chỉ đếm.

**Đề xuất: giữ code, sửa spec.** Danh sách id là siêu tập của count. Sửa 1 câu trong doc rẻ hơn làm nghèo dữ liệu đi.

### Q3 — Route `/audit` hay `/admin/audit-logs`?

Sidebar và `App.tsx` đang dùng `/audit`. Spec dùng `/admin/audit-logs`, khớp với `/admin/users`, `/admin/classes` — tất cả màn hình Admin khác đều có tiền tố `/admin`.

**Đề xuất: đổi sang `/admin/audit-logs`** cho nhất quán. Chỉ 2 chỗ tham chiếu (`App.tsx:73`, `AppShell.tsx:68`), không có deep link nào ngoài đó (`grep -rn '"/audit"' frontend/src` để xác nhận trước khi đổi).

### Q4 — Phân trang

Bảng chỉ có ghi thêm, không bao giờ xoá; `GET /api/audit-logs` trả **toàn bộ**. Với dữ liệu demo thì không sao, nhưng nó tăng đơn điệu mãi mãi.

**Đề xuất: giữ full list theo spec §3**, thêm `ponytail:` comment trong view. Phân trang là thay đổi API có ảnh hưởng tới frontend; làm khi có số liệu thật, không làm phòng xa.

---

## 3. File Structure

**Backend**

| File | Trách nhiệm |
|---|---|
| `backend/classes/views.py:318-325` | sửa: thêm `write_audit` cho resource |
| `backend/audit/labels.py` | tạo: `resolve_labels(logs) -> dict[int, str]`, 4 query theo lô |
| `backend/audit/serializers.py` | sửa: thêm `target_label` đọc từ context |
| `backend/audit/views.py` | sửa: dựng context nhãn |
| `backend/audit/tests/test_audit.py` | sửa: test cho nhãn |
| `backend/classes/tests/test_classes.py` | sửa: test cho `class_resource.created` |

**Frontend**

| File | Trách nhiệm |
|---|---|
| `frontend/src/types.ts` | thêm `AuditLog` |
| `frontend/src/lib/auditActions.ts` | tạo: map `action` → câu hiển thị (dữ liệu thuần, tách khỏi page để test riêng) |
| `frontend/src/pages/admin/AuditLogPage.tsx` | tạo |
| `frontend/src/App.tsx` | sửa: route `/admin/audit-logs`, xoá `Placeholder` |
| `frontend/src/components/AppShell.tsx:68` | sửa: link sidebar |
| `frontend/src/test/lib/auditActions.test.ts`, `frontend/src/test/pages/AuditLogPage.test.tsx` | tạo |

---

## 4. Backend

Chạy test: `cd backend && python manage.py test audit classes`.

### Task 1: Chốt lại danh mục action đang ghi

**Files:**
- Test: `backend/audit/tests/test_audit.py`

**Interfaces:**
- Consumes: `AuditLog` model.
- Produces: hằng `EXPECTED_ACTIONS` mà Task 2 sẽ nối `class_resource.created` vào.

Task này biến bảng §4 của spec thành test. Không có test kiểu này thì một action bị đổi tên sẽ trôi qua im lặng và chỉ lộ ra ở UI dưới dạng mã dotted thô.

- [ ] **Step 1: Viết test**

```python
# thêm vào backend/audit/tests/test_audit.py
import ast
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
EXPECTED_ACTIONS = {
    "account.created", "account.updated", "account.self_updated", "account.deactivated",
    "account.reactivated", "account.deleted", "account.password_changed", "account.password_set",
    "class.created", "class.updated", "class.status_changed", "class.reopened", "class.teacher_changed",
    "enrollment.created", "enrollment.replaced", "enrollment.removed",
    "assignment.created", "assignment.updated", "assignment.rubric.updated",
    "submission.created", "grade.created",
}


class AuditActionInventoryTests(TestCase):
    """Bảng action trong docs/overview/08-audit-log.md §4 là hợp đồng với UI:
    mỗi mã ở đây phải có một câu tiếng Việt tương ứng ở frontend."""

    def test_the_code_writes_exactly_the_documented_actions(self):
        found = set()
        for path in BACKEND_ROOT.rglob("*.py"):
            if "tests" in path.parts or "migrations" in path.parts:
                continue
            for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
                if not (isinstance(node, ast.Call) and getattr(node.func, "id", None) == "write_audit"):
                    continue
                for keyword in node.keywords:
                    if keyword.arg != "action":
                        continue
                    # Đi vào cả biểu thức: hai call site dùng `A if cond else B`
                    # (account.reactivated/deactivated, class.reopened/updated),
                    # nên bắt theo chuỗi literal chứ không theo dạng cú pháp.
                    found.update(
                        child.value for child in ast.walk(keyword.value)
                        if isinstance(child, ast.Constant) and isinstance(child.value, str)
                    )
        self.assertEqual(found, EXPECTED_ACTIONS)
```

> Đã chạy thử phiên bản này trên cây code hiện tại: trả đúng 21 action, khớp bảng spec §4. Bản dùng regex `action="..."` bắt hụt `account.deactivated` và `class.updated` vì chúng nằm ở nhánh `else`.

- [ ] **Step 2: Chạy**

Run: `cd backend && python manage.py test audit -v 2`
Expected: PASS. Nếu FAIL, so sánh set chênh lệch trong output với bảng §4 rồi dừng lại báo cáo — đừng sửa `EXPECTED_ACTIONS` cho khớp code mà chưa hiểu vì sao lệch.

- [ ] **Step 3: Commit**

```bash
git add backend/audit/tests/test_audit.py
git commit -m "test(audit): pin the documented action inventory"
```

### Task 2: `class_resource.created` (A2)

**Files:**
- Modify: `backend/classes/views.py:318-325`
- Modify: `backend/audit/tests/test_audit.py` (thêm vào `EXPECTED_ACTIONS`)
- Test: `backend/classes/tests/test_classes.py`

**Interfaces:**
- Produces: action mới `class_resource.created`, `target = ClassResource` (`target_type = "classes.classresource"`), `metadata = {"class_id": int, "resource_id": int}`. Task 3 phân giải nhãn cho `classes.classresource`; Task 5 hiển thị "Đã thêm tài liệu".

- [ ] **Step 1: Viết test đỏ**

```python
# thêm vào backend/classes/tests/test_classes.py, lớp test đã bao phủ ClassResourcesView
    def test_creating_a_resource_writes_an_audit_row_in_the_same_transaction(self):
        from audit.models import AuditLog

        response = self.authenticate(self.teacher).post(
            f"/api/classes/{self.class_.id}/resources",
            {"title": "Slide deck", "description": "Week 1", "url": "https://example.test/slides"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        log = AuditLog.objects.get(action="class_resource.created")
        self.assertEqual(log.actor_id, self.teacher.id)
        self.assertEqual(log.target_type, "classes.classresource")
        self.assertEqual(log.target_id, response.data["id"])
        self.assertEqual(log.metadata, {"class_id": self.class_.id, "resource_id": response.data["id"]})

    def test_a_rejected_resource_leaves_no_audit_row(self):
        from audit.models import AuditLog

        response = self.authenticate(self.teacher).post(
            f"/api/classes/{self.class_.id}/resources",
            {"title": "x", "url": "not-a-url"}, format="json",
        )
        self.assertEqual(response.status_code, 422)
        self.assertFalse(AuditLog.objects.filter(action="class_resource.created").exists())
```

> Tên fixture (`self.teacher`, `self.class_`, helper `authenticate`) phải khớp lớp test bạn chèn vào — đọc `setUp` của lớp đó trước khi dán.

- [ ] **Step 2: Chạy để xác nhận fail**

Run: `cd backend && python manage.py test classes -v 2`
Expected: FAIL — `AuditLog.DoesNotExist: AuditLog matching query does not exist.`

- [ ] **Step 3: Thêm write_audit**

```python
# backend/classes/views.py — trong ClassResourcesView.post
        with transaction.atomic():
            resource = serializer.save(classroom=classroom)
            write_audit(
                actor=request.user,
                action="class_resource.created",
                target=resource,
                metadata={"class_id": classroom.id, "resource_id": resource.id},
            )
            create_notifications(classroom, "RESOURCE_CREATED", f"New resource: {resource.title}", f"/student/classes/{classroom.id}")
```

> `write_audit` đã được import ở đầu `classes/views.py` cho các view khác — kiểm bằng `grep -n "write_audit" backend/classes/views.py | head -1`. `title` **không** được đưa vào metadata: scrubber sẽ nuốt nó (08 §5), tên hiển thị lấy từ chính row `ClassResource` ở Task 3.

- [ ] **Step 4: Cập nhật danh mục**

```python
# backend/audit/tests/test_audit.py — thêm vào EXPECTED_ACTIONS
    "class_resource.created",
```

- [ ] **Step 5: Chạy lại**

Run: `cd backend && python manage.py test audit classes -v 2`
Expected: PASS toàn bộ.

- [ ] **Step 6: Commit**

```bash
git add backend/classes/views.py backend/classes/tests/test_classes.py backend/audit/tests/test_audit.py
git commit -m "feat(audit): record class resource creation"
```

### Task 3: Tầng phân giải nhãn (A1, A7, Q1)

**Files:**
- Create: `backend/audit/labels.py`
- Modify: `backend/audit/serializers.py`
- Modify: `backend/audit/views.py`
- Test: `backend/audit/tests/test_audit.py`

**Interfaces:**
- Produces:
  - `resolve_labels(logs: Sequence[AuditLog]) -> dict[int, str]` — key là `log.id`, value là chuỗi hiển thị đã sẵn sàng (ví dụ `"Student Tran Minh Anh"`, `"Lab 3 · Tran Minh Anh · 85"`). Trả `""` cho log không phân giải được.
  - `AuditLogSerializer` thêm field `target_label` (string, có thể rỗng), đọc từ `self.context["labels"]`.
- Consumes: `AuditLog`, `accounts.User`, `classes.Class`, `classes.ClassResource`, `assignments.Assignment`.

- [ ] **Step 1: Viết test đỏ**

```python
# thêm vào backend/audit/tests/test_audit.py
from assignments.models import Assignment
from classes.models import Class, ClassResource
from django.utils import timezone


class TargetLabelTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user("admin2@example.test", "pw", role="ADMIN")
        self.teacher = User.objects.create_user("teacher2@example.test", "pw", role="TEACHER")
        self.teacher.full_name = "Pham Thu Hoa"; self.teacher.save(update_fields=("full_name",))
        self.student = User.objects.create_user("student2@example.test", "pw", role="STUDENT")
        self.student.full_name = "Tran Minh Anh"; self.student.save(update_fields=("full_name",))
        self.class_ = Class.objects.create(
            name="Web Development K18A", teacher=self.teacher,
            starts_at=timezone.now(), ends_at=timezone.now() + timezone.timedelta(days=30),
        )
        self.assignment = Assignment.objects.create(
            classroom=self.class_, title="Lab 3", description="Responsive layout",
            due_at=timezone.now() + timezone.timedelta(days=7),
        )
        self.client = APIClient()

    def labels(self):
        self.client.force_authenticate(user=self.admin)
        return {row["action"]: row["target_label"] for row in self.client.get("/api/audit-logs").data}

    def test_an_account_row_names_the_user_and_their_role(self):
        AuditLog.objects.create(actor=self.admin, action="account.created",
                                target_type="accounts.user", target_id=self.student.id, metadata={})
        self.assertEqual(self.labels()["account.created"], "Student Tran Minh Anh")

    def test_a_class_row_names_the_class(self):
        AuditLog.objects.create(actor=self.admin, action="class.created",
                                target_type="classes.class", target_id=self.class_.id, metadata={})
        self.assertEqual(self.labels()["class.created"], "Web Development K18A")

    def test_a_removed_enrollment_resolves_from_metadata_not_the_deleted_row(self):
        AuditLog.objects.create(
            actor=self.admin, action="enrollment.removed", target_type="classes.enrollment",
            target_id=99999, metadata={"class_id": self.class_.id, "student_id": self.student.id},
        )
        self.assertEqual(self.labels()["enrollment.removed"], "Web Development K18A · Tran Minh Anh")

    def test_a_grade_row_carries_the_assignment_student_and_score(self):
        AuditLog.objects.create(
            actor=self.teacher, action="grade.created", target_type="grading.grade", target_id=1,
            metadata={"assignment_id": self.assignment.id, "student_id": self.student.id,
                      "submission_id": 1, "total_score": 85},
        )
        self.assertEqual(self.labels()["grade.created"], "Lab 3 · Tran Minh Anh · 85")

    def test_a_submission_row_names_the_assignment_and_student(self):
        AuditLog.objects.create(
            actor=self.student, action="submission.created", target_type="submissions.submission",
            target_id=1, metadata={"assignment_id": self.assignment.id, "student_id": self.student.id, "version": 2},
        )
        self.assertEqual(self.labels()["submission.created"], "Lab 3 · Tran Minh Anh")

    def test_a_resource_row_names_the_resource(self):
        resource = ClassResource.objects.create(classroom=self.class_, title="Slide deck", url="https://example.test/s")
        AuditLog.objects.create(
            actor=self.teacher, action="class_resource.created", target_type="classes.classresource",
            target_id=resource.id, metadata={"class_id": self.class_.id, "resource_id": resource.id},
        )
        self.assertEqual(self.labels()["class_resource.created"], "Slide deck")

    def test_an_unresolvable_target_yields_an_empty_label_not_an_error(self):
        AuditLog.objects.create(actor=self.admin, action="class.created",
                                target_type="classes.class", target_id=424242, metadata={})
        self.assertEqual(self.labels()["class.created"], "")

    def test_the_label_pass_does_not_scale_its_query_count_with_the_row_count(self):
        for index in range(20):
            AuditLog.objects.create(actor=self.admin, action="account.created",
                                    target_type="accounts.user", target_id=self.student.id,
                                    metadata={"index": index})
        self.client.force_authenticate(user=self.admin)
        with self.assertNumQueries(6):
            self.client.get("/api/audit-logs")
```

> Số `6` ở test cuối = 1 (logs) + 1 (actor qua `select_related`, gộp vào query logs → điều chỉnh nếu bạn dùng `select_related`) + 4 query nhãn. Chạy thật rồi chốt con số theo output — điều quan trọng là **hằng số**, không phải giá trị cụ thể: sau khi chốt, thêm 20 dòng nữa không được làm nó tăng.

> `Assignment.objects.create(...)` và `Class.objects.create(...)` phải khớp field bắt buộc của model. Kiểm trước bằng `python manage.py shell -c "from assignments.models import Assignment; print([f.name for f in Assignment._meta.fields])"`.

- [ ] **Step 2: Chạy để xác nhận fail**

Run: `cd backend && python manage.py test audit -v 2`
Expected: FAIL — `KeyError: 'target_label'` (serializer chưa có trường này).

- [ ] **Step 3: Viết `audit/labels.py`**

```python
# backend/audit/labels.py
"""Biến (action, target_type, target_id, metadata) thành một chuỗi người đọc được.

Hai ràng buộc định hình module này:
  * metadata không bao giờ chứa chuỗi (safe_metadata loại sạch), nên tên phải
    lấy từ bảng gốc chứ không thể lưu sẵn trong row audit;
  * enrollment.removed ghi audit rồi xoá chính row nó trỏ tới, nên với họ
    action enrollment.* ta phân giải theo metadata (class_id/student_id),
    không theo target_id.
Đổi lại toàn bộ pass này là 4 truy vấn cố định, bất kể log dài bao nhiêu.
"""
from accounts.models import User
from assignments.models import Assignment
from classes.models import Class, ClassResource

SEPARATOR = " · "


def _ids(logs, predicate, extract):
    return {value for log in logs if predicate(log) for value in (extract(log),) if isinstance(value, int)}


def resolve_labels(logs):
    logs = list(logs)
    family = lambda log: log.action.split(".")[0]

    user_ids = _ids(logs, lambda log: log.target_type == "accounts.user", lambda log: log.target_id)
    user_ids |= _ids(logs, lambda log: True, lambda log: log.metadata.get("student_id"))
    class_ids = _ids(logs, lambda log: log.target_type == "classes.class", lambda log: log.target_id)
    class_ids |= _ids(logs, lambda log: family(log) in {"enrollment", "class_resource"},
                      lambda log: log.metadata.get("class_id"))
    assignment_ids = _ids(logs, lambda log: log.target_type == "assignments.assignment", lambda log: log.target_id)
    assignment_ids |= _ids(logs, lambda log: True, lambda log: log.metadata.get("assignment_id"))
    resource_ids = _ids(logs, lambda log: log.target_type == "classes.classresource", lambda log: log.target_id)

    users = {row.id: f"{row.role.capitalize()} {row.full_name or row.email}"
             for row in User.objects.filter(id__in=user_ids).only("id", "role", "full_name", "email")}
    classes = {row.id: row.name for row in Class.objects.filter(id__in=class_ids).only("id", "name")}
    assignments = {row.id: row.title
                   for row in Assignment.objects.filter(id__in=assignment_ids).only("id", "title")}
    resources = {row.id: row.title
                 for row in ClassResource.objects.filter(id__in=resource_ids).only("id", "title")}

    def label(log):
        data = log.metadata or {}
        group = family(log)
        if group == "account":
            return users.get(log.target_id, "")
        if group == "class":
            return classes.get(log.target_id, "")
        if group == "enrollment":
            # target_id có thể trỏ vào một Enrollment đã bị xoá (08 §5.1 A7).
            parts = [classes.get(data.get("class_id"), "") or classes.get(log.target_id, ""),
                     users.get(data.get("student_id"), "")]
            return SEPARATOR.join(part for part in parts if part)
        if group == "class_resource":
            return resources.get(log.target_id, "")
        if group == "assignment":
            return assignments.get(log.target_id, "")
        if group == "submission":
            parts = [assignments.get(data.get("assignment_id"), ""), users.get(data.get("student_id"), "")]
            return SEPARATOR.join(part for part in parts if part)
        if group == "grade":
            parts = [assignments.get(data.get("assignment_id"), ""), users.get(data.get("student_id"), "")]
            score = data.get("total_score")
            if score is not None:
                parts.append(str(score))
            return SEPARATOR.join(part for part in parts if part)
        return ""

    return {log.id: label(log) for log in logs}
```

> `users` ghép cả họ tên lẫn role thành một chuỗi ("Student Tran Minh Anh") vì spec §2.1 render đúng như vậy. `role.capitalize()` cho `STUDENT` → `Student`.
> Nhãn `enrollment` bỏ role của student cho khỏi lặp: đã có tên lớp rồi. Nếu output thực tế thành `"Web Development K18A · Student Tran Minh Anh"` mà bạn muốn bỏ chữ `Student`, sửa test và hàm cùng lúc — đừng để hai bên lệch nhau.

- [ ] **Step 4: Nối vào serializer**

```python
# backend/audit/serializers.py
class AuditLogSerializer(serializers.ModelSerializer):
    actor_id = serializers.IntegerField(read_only=True)
    actor = serializers.SerializerMethodField()
    metadata = serializers.SerializerMethodField()
    target_label = serializers.SerializerMethodField()

    def get_actor(self, log):
        return {"id": log.actor_id, "full_name": log.actor.full_name, "email": log.actor.email}

    def get_metadata(self, log):
        return safe_metadata(log.metadata)

    def get_target_label(self, log):
        """View đã phân giải sẵn theo lô; không tra cứu gì ở đây, nếu không
        mỗi dòng lại là một query."""
        return self.context.get("labels", {}).get(log.id, "")

    class Meta:
        model = AuditLog
        fields = ("id", "actor_id", "actor", "action", "target_type", "target_id", "target_label", "metadata", "created_at")
```

- [ ] **Step 5: Dựng context trong view**

```python
# backend/audit/views.py
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from .labels import resolve_labels
from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        # ponytail: bảng chỉ tăng, chưa bao giờ xoá — thêm ?page khi log thật đủ dài.
        logs = list(AuditLog.objects.select_related("actor"))
        return Response(AuditLogSerializer(logs, many=True, context={"labels": resolve_labels(logs)}).data)
```

- [ ] **Step 6: Chạy lại**

Run: `cd backend && python manage.py test audit -v 2`
Expected: PASS. Test đếm query sẽ báo con số thật trong thông báo lỗi nếu lệch — cập nhật hằng số rồi chạy lại một lần nữa để xác nhận nó ổn định.

- [ ] **Step 7: Commit**

```bash
git add backend/audit
git commit -m "feat(audit): resolve target labels in one batched pass"
```

---

## 5. Frontend

Chạy test: `cd frontend && npm test`. Type-check: `npm run build`.

### Task 4: Type + map action → câu hiển thị (A4, A6)

**Files:**
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/lib/auditActions.ts`
- Test: `frontend/src/test/lib/auditActions.test.ts`

**Interfaces:**
- Produces:
  - `interface AuditLog { id: number; actor_id: number; actor: { id: number; full_name: string | null; email: string }; action: string; target_type: string; target_id: number; target_label: string; metadata: Record<string, unknown>; created_at: string }`
  - `actionLabel(log: Pick<AuditLog, "action" | "metadata">): string`

- [ ] **Step 1: Viết test đỏ**

```ts
// frontend/src/test/lib/auditActions.test.ts
import { describe, expect, it } from "vitest";

import { actionLabel } from "../../lib/auditActions";

describe("actionLabel", () => {
  it("maps every documented action to a sentence", () => {
    expect(actionLabel({ action: "account.created", metadata: {} })).toBe("Tạo tài khoản");
    expect(actionLabel({ action: "account.self_updated", metadata: {} })).toBe("Cập nhật hồ sơ cá nhân");
    expect(actionLabel({ action: "account.password_changed", metadata: {} })).toBe("Đổi mật khẩu của mình");
    expect(actionLabel({ action: "account.password_set", metadata: {} })).toBe("Đặt mật khẩu cho tài khoản");
    expect(actionLabel({ action: "class.reopened", metadata: {} })).toBe("Gia hạn ngày kết thúc lớp");
    expect(actionLabel({ action: "class.teacher_changed", metadata: {} })).toBe("Đổi giáo viên");
    expect(actionLabel({ action: "enrollment.replaced", metadata: {} })).toBe("Thay danh sách lớp");
    expect(actionLabel({ action: "assignment.rubric.updated", metadata: {} })).toBe("Cập nhật rubric");
    expect(actionLabel({ action: "submission.created", metadata: {} })).toBe("Nộp bài");
    expect(actionLabel({ action: "grade.created", metadata: {} })).toBe("Ghi điểm");
    expect(actionLabel({ action: "class_resource.created", metadata: {} })).toBe("Thêm tài liệu");
  });

  it("reads class.status_changed as two different sentences from metadata", () => {
    expect(actionLabel({ action: "class.status_changed", metadata: { is_active: true } })).toBe("Bật lớp");
    expect(actionLabel({ action: "class.status_changed", metadata: { is_active: false } })).toBe("Tắt lớp");
  });

  it("falls back to the raw dotted code rather than hiding an unknown action", () => {
    expect(actionLabel({ action: "something.new", metadata: {} })).toBe("something.new");
  });
});
```

- [ ] **Step 2: Chạy để xác nhận fail**

Run: `cd frontend && npm test -- auditActions`
Expected: FAIL — không resolve được module.

- [ ] **Step 3: Viết map**

```ts
// frontend/src/lib/auditActions.ts
import type { AuditLog } from "../types";

/** Một mã action, hai câu: class.status_changed mang cả bật lẫn tắt trong
 * metadata.is_active, thay vì tách thành hai mã chở đúng một bit (08 §2.1). */
const ACTION_LABEL: Record<string, string> = {
  "account.created": "Tạo tài khoản",
  "account.updated": "Cập nhật tài khoản",
  "account.self_updated": "Cập nhật hồ sơ cá nhân",
  "account.deactivated": "Vô hiệu hoá tài khoản",
  "account.reactivated": "Kích hoạt tài khoản",
  "account.deleted": "Xoá tài khoản",
  "account.password_changed": "Đổi mật khẩu của mình",
  "account.password_set": "Đặt mật khẩu cho tài khoản",
  "class.created": "Tạo lớp",
  "class.updated": "Cập nhật lớp",
  "class.reopened": "Gia hạn ngày kết thúc lớp",
  "class.teacher_changed": "Đổi giáo viên",
  "enrollment.created": "Thêm học viên",
  "enrollment.replaced": "Thay danh sách lớp",
  "enrollment.removed": "Gỡ học viên",
  "assignment.created": "Tạo bài tập",
  "assignment.updated": "Cập nhật bài tập",
  "assignment.rubric.updated": "Cập nhật rubric",
  "submission.created": "Nộp bài",
  "grade.created": "Ghi điểm",
  "class_resource.created": "Thêm tài liệu",
};

export function actionLabel({ action, metadata }: Pick<AuditLog, "action" | "metadata">): string {
  if (action === "class.status_changed") return metadata?.is_active ? "Bật lớp" : "Tắt lớp";
  /** Action lạ hiện nguyên mã: một cái log âm thầm nuốt dòng nó không hiểu
   * còn tệ hơn một cái log xấu (08 §2.1). */
  return ACTION_LABEL[action] ?? action;
}
```

- [ ] **Step 4: Thêm type**

```ts
// thêm vào cuối frontend/src/types.ts
export interface AuditLog {
  id: number;
  actor_id: number;
  actor: { id: number; full_name: string | null; email: string };
  action: string;
  target_type: string;
  target_id: number;
  /** Backend phân giải sẵn theo lô; rỗng khi target không còn tra được (08 §5.1). */
  target_label: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
```

- [ ] **Step 5: Chạy lại**

Run: `cd frontend && npm test -- auditActions && npm run build`
Expected: PASS, build sạch.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/auditActions.ts frontend/src/types.ts frontend/src/test/lib/auditActions.test.ts
git commit -m "feat(audit): map audit action codes to readable sentences"
```

### Task 5: `AuditLogPage` (A1, A4, A5)

**Files:**
- Create: `frontend/src/pages/admin/AuditLogPage.tsx`
- Modify: `frontend/src/App.tsx:73`
- Modify: `frontend/src/components/AppShell.tsx:68`
- Test: `frontend/src/test/pages/AuditLogPage.test.tsx`

**Interfaces:**
- Consumes: `AuditLog` (Task 4), `actionLabel` (Task 4), `DataTable`/`Column`/`TruncatedText` từ `components/Table`, `formatDateTime` từ `lib/format`.
- Produces: `export function AuditLogPage(): JSX.Element` tại route `/admin/audit-logs`.

- [ ] **Step 1: Viết test đỏ**

```tsx
// frontend/src/test/pages/AuditLogPage.test.tsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { AuditLogPage } from "../../pages/admin/AuditLogPage";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});
const log = (overrides = {}) => ({
  id: 1, actor_id: 1,
  actor: { id: 1, full_name: "Le Quoc Bao", email: "admin@example.test" },
  action: "account.created", target_type: "accounts.user", target_id: 7,
  target_label: "Student Tran Minh Anh", metadata: {},
  created_at: "2026-07-29T10:15:00Z", ...overrides,
});

function openPage(fetchMock: ReturnType<typeof vi.fn>) {
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><AuditLogPage /></MemoryRouter>);
}

describe("Audit log page", () => {
  afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); });

  it("renders time, actor, readable action and resolved target", async () => {
    openPage(vi.fn().mockResolvedValue(json([log()])));
    expect(await screen.findByText("Tạo tài khoản")).toBeTruthy();
    expect(screen.getByText("Student Tran Minh Anh")).toBeTruthy();
    expect(screen.getByText(/Le Quoc Bao/)).toBeTruthy();
  });

  it("reads class.status_changed off metadata", async () => {
    openPage(vi.fn().mockResolvedValue(json([
      log({ id: 2, action: "class.status_changed", metadata: { is_active: false }, target_label: "Cohort 5" }),
    ])));
    expect(await screen.findByText("Tắt lớp")).toBeTruthy();
  });

  it("shows an unknown action as its raw code instead of dropping the row", async () => {
    openPage(vi.fn().mockResolvedValue(json([log({ id: 3, action: "something.new" })])));
    expect(await screen.findByText("something.new")).toBeTruthy();
  });

  it("falls back to the raw target when the label could not be resolved", async () => {
    openPage(vi.fn().mockResolvedValue(json([log({ id: 4, target_label: "", target_type: "classes.class", target_id: 42 })])));
    expect(await screen.findByText("classes.class #42")).toBeTruthy();
  });

  it("shows an empty state when nothing has been logged", async () => {
    openPage(vi.fn().mockResolvedValue(json([])));
    expect(await screen.findByText("Chưa có hoạt động nào.")).toBeTruthy();
  });

  it("surfaces a load failure", async () => {
    openPage(vi.fn().mockResolvedValue(json({ detail: "boom" }, 500)));
    expect(await screen.findByText("Không tải được nhật ký.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Chạy để xác nhận fail**

Run: `cd frontend && npm test -- AuditLogPage`
Expected: FAIL — không resolve được module.

- [ ] **Step 3: Viết page**

```tsx
// frontend/src/pages/admin/AuditLogPage.tsx
import { useEffect, useState } from "react";

import { Alert } from "../../components/Alert";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { DataTable, TruncatedText, type Column } from "../../components/Table";
import { request } from "../../lib/api";
import { actionLabel } from "../../lib/auditActions";
import { formatDateTime } from "../../lib/format";
import type { AuditLog } from "../../types";

const columns: Column<AuditLog>[] = [
  { key: "time", header: "Thời gian", width: "11rem", render: (log) => formatDateTime(log.created_at) },
  { key: "actor", header: "Người thực hiện", width: "14rem",
    render: (log) => <TruncatedText>{log.actor.full_name ?? log.actor.email}</TruncatedText> },
  { key: "action", header: "Hành động", width: "12rem", render: (log) => actionLabel(log) },
  /** Nhãn rỗng nghĩa là target không tra được (row đã xoá, hoặc action mới chưa
   * có luật phân giải) — hiện mã thô chứ không để trống (08 §2.1). */
  { key: "target", header: "Đối tượng", width: "18rem",
    render: (log) => <TruncatedText>{log.target_label || `${log.target_type} #${log.target_id}`}</TruncatedText> },
];

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>();
  const [failure, setFailure] = useState("");
  useEffect(() => {
    request<AuditLog[]>("/audit-logs", { token: sessionStorage.getItem("access_token") ?? undefined })
      .then((value) => value && setLogs(value))
      .catch(() => { setFailure("Không tải được nhật ký."); setLogs([]); });
  }, []);
  return <section className="page-stack">
    <h1>Nhật ký hoạt động</h1>
    <p className="muted">Theo dõi thay đổi về tài khoản và hoạt động học tập.</p>
    {failure && <Alert>{failure}</Alert>}
    <Card>
      {!logs ? <Spinner label="Loading audit log" />
        : logs.length === 0 && !failure ? <EmptyState>Chưa có hoạt động nào.</EmptyState>
          : <DataTable rowKey={(log) => log.id} data={logs} columns={columns} />}
    </Card>
  </section>;
}
```

> Chữ ký `Column`/`DataTable`/`TruncatedText` phải khớp `frontend/src/components/Table.tsx` — `StudentClassPage.tsx` là ví dụ dùng đúng khuôn hiện tại; đọc rồi chỉnh nếu prop khác.

- [ ] **Step 4: Nối route (Q3)**

```tsx
// frontend/src/App.tsx — import
import { AuditLogPage } from "./pages/admin/AuditLogPage";
```

```tsx
// thay dòng 73
        <Route path="/admin/audit-logs" element={<AuditLogPage />} />
```

Sau bước này, `Placeholder` không còn chỗ dùng nào (route `/notifications` đã bị bỏ ở [plan 07](07-notifications-and-resources-plan.md) Task 8) → xoá luôn khai báo:

```bash
grep -rn "Placeholder" frontend/src   # phải không còn kết quả nào ngoài dòng định nghĩa
```

```tsx
// xoá khỏi frontend/src/App.tsx
function Placeholder({ title }: { title: string }) { return <h1>{title}</h1>; }
```

- [ ] **Step 5: Sửa link sidebar**

```tsx
// frontend/src/components/AppShell.tsx:68 — đổi to="/audit"
          <Link className="nav-link" to="/admin/audit-logs" aria-label="Audit" tabIndex={drawerTabIndex} onClick={closeDrawer}><Icon name="shield" /><span className="nav-label">Audit</span></Link>
```

Xác nhận không còn tham chiếu cũ: `grep -rn '"/audit"' frontend/src` phải rỗng.

- [ ] **Step 6: Chạy lại**

Run: `cd frontend && npm test && npm run build`
Expected: PASS toàn bộ, build sạch.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/admin/AuditLogPage.tsx frontend/src/App.tsx frontend/src/components/AppShell.tsx frontend/src/test/pages/AuditLogPage.test.tsx
git commit -m "feat(audit): add the admin audit log screen"
```

---

## 6. Task 6: Đồng bộ lại spec

**Files:**
- Modify: `docs/overview/08-audit-log.md`

- [ ] **Step 1: Cập nhật bảng §2.1**

Thêm dòng `class_resource.created` → "Đã thêm tài liệu" → target = tiêu đề tài liệu. Bổ sung ghi chú: nhãn target do backend phân giải (`target_label`), không phải frontend tự tra.

- [ ] **Step 2: Sửa câu về `enrollment.replaced` (Q2)**

Câu "`metadata` carries the added/removed **counts**" sai so với code: metadata là `{class_id, student_ids: [...]}`. Sửa thành mô tả đúng, giữ nguyên lập luận "strings don't survive the scrubber".

- [ ] **Step 3: Sửa §5.1**

Bỏ mục "Class resource creation ... This one is an inconsistency" — đã đóng ở Task 2. Thay bằng một dòng ghi nhận action mới trong bảng §4.

- [ ] **Step 4: Ghi nhận A7**

Thêm vào §6 Edge cases: `enrollment.removed` ghi audit rồi xoá row, nên `target_id` trỏ vào một `Enrollment` không còn tồn tại; nhãn được dựng từ `metadata.class_id` / `metadata.student_id`. Đây là lý do metadata của họ action `enrollment.*` không thể bị làm nghèo đi.

- [ ] **Step 5: Sửa route ở §2.1 nếu cần**

Spec đã ghi `/admin/audit-logs`; sau Q3 code khớp — chỉ kiểm lại, không cần sửa.

- [ ] **Step 6: Commit**

```bash
git add docs/overview/08-audit-log.md
git commit -m "docs(08): record the resource action and the resolved target labels"
```

---

## 7. Verify toàn bộ

- [ ] `cd backend && python manage.py test` — toàn bộ suite xanh.
- [ ] `cd frontend && npm test` — toàn bộ suite xanh.
- [ ] `cd frontend && npm run build` — không lỗi TS.
- [ ] Chạy tay với Admin: mở `/admin/audit-logs` → mỗi dòng có thời gian, tên người thực hiện, câu tiếng Việt, tên đối tượng; không dòng nào hiện `#` trần trừ khi đối tượng thật sự đã bị xoá.
- [ ] Chạy tay: Teacher thêm một resource → refresh `/admin/audit-logs` → xuất hiện dòng "Thêm tài liệu · <tên tài liệu>".
- [ ] Chạy tay: Admin gỡ một học viên khỏi lớp → dòng "Gỡ học viên" hiện `<tên lớp> · <tên học viên>` chứ không rỗng.
- [ ] `curl` với token của Teacher tới `/api/audit-logs` → `403`; không token → `401`.

---

## 8. Không làm (và lý do)

| Việc | Lý do |
|---|---|
| Audit cho read/download | Spec §5.1: một dòng mỗi lần tải file sẽ chôn vùi các dòng ghi. Thêm khi có yêu cầu access-review thật |
| Lưu giá trị trước/sau của `due_at` | Spec §5.2 ghi rõ chưa làm; nếu làm phải truyền **epoch seconds** (số), chuỗi ISO sẽ bị scrubber nuốt |
| Phân trang `/api/audit-logs` | Q4 — spec §3 nói full list; đổi API là thay đổi có ảnh hưởng, làm khi có số liệu |
| Bộ lọc theo actor/action/khoảng ngày | Không có trong spec §2.1; thêm sau khi màn hình cơ bản đã ship |
| Nới lỏng append-only | Ba tầng chặn là điểm mạnh nhất của feature này |
| Xoá cứng bất kỳ thứ gì trong domain | Spec §4: không có gì bị xoá cứng, nên log không bao giờ phải trả lời "row đã mất chứa gì" |
