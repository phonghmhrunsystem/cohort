# Plan: Gradebook (docs/overview/06-gradebook.md)

Spec: [06-gradebook.md](../overview/06-gradebook.md). Status audit date: 2026-08-01, branch `feature/improve_ui`.

## 0. Kết luận nhanh

Backend gradebook **đã tồn tại** (`GradebookView`, `GradebookCsvView`, `gradebook_data`, `GradebookSerializer`) nhưng lệch spec ở 7 điểm. Frontend `TeacherGradebookPage` **chưa tồn tại** — không có page, không có route, không có type, không có nút CSV, không có link từ `TeacherClassPage`.

Khối lượng: ~1 ngày backend (sửa lệch + test), ~1 ngày frontend (page mới + test).

---

## 1. Audit: spec vs code

| # | Spec | Code hiện tại | File | Mức |
|---|---|---|---|---|
| B1 | Student → `404` (out of scope), Admin → `403` | Cả Student lẫn Admin đều `403` — `teacher_gradebook_class` trả `None` cho mọi non-TEACHER, view map `None → 403` | `classes/views.py:348`, `:140` | Cao |
| B2 | Dùng `scoped_classes` để lọc Class trước khi lookup | Dùng thẳng `Class.objects.filter(teacher=user)` — bỏ qua `is_active=True` mà `scoped_classes` áp cho Teacher | `classes/views.py:348` | Cần quyết định |
| B3 | Students **sắp theo tên** | `.order_by("id")` | `classes/views.py:356` | Cao |
| B4 | Assignments `created_at` ascending | `.order_by("id")` | `classes/views.py:366` | Trung bình |
| B5 | Serializer phát `is_active` để UI gắn tag `đã tắt` | Chỉ có `id`, `full_name`, `email`, `grades[]` — không có `is_active` | `classes/serializers.py:125` | Cao |
| B6 | CSV: cell = `score` khi GRADED, ngược lại nhãn tiếng Việt (`Đã nộp`/`Chưa nộp`/`Đã đóng`) | CSV ghi enum thô: `GRADED: 91`, `OPEN`, `SUBMITTED` | `classes/views.py:168` | Cao |
| B7 | "Xuất CSV" = tải file | Không có header `Content-Disposition: attachment` → trình duyệt render inline | `classes/views.py:157` | Cao |
| F1 | `TeacherGradebookPage` tại `/teacher/classes/{id}/gradebook` | Không tồn tại | `frontend/src/` | Cao |

Điểm **đúng spec, không đụng vào**: unpaginated cả hai trục; latest-submission qua `Subquery` (không N+1, không lộ version); `select_related("classroom")` cho `assignment_learning_state`; reuse `gradebook_data` trong CSV view; `csv_value()` chặn formula injection; students query không lọc `is_active` nên tài khoản bị vô hiệu vẫn ở lại ma trận; `is_deleted=False` loại soft-deleted; header cột mang `maximum_score`.

---

## 2. Quyết định cần chốt trước khi code

**B2 — Gradebook của Class đã kết thúc/đã tắt.** Spec §5 nói dùng `scoped_classes`, mà `scoped_classes` lọc `is_active=True` cho Teacher → Class đã tắt sẽ trả `404`. Code hiện tại vẫn cho xem. Bảng điểm là read-only và giá trị lớn nhất của nó là *sau khi lớp kết thúc* (xuất CSV làm tổng kết), nên khoá lại có vẻ sai mục đích.

Đề xuất: **giữ hành vi hiện tại** (Class đã tắt vẫn đọc được gradebook), và sửa *spec* §5 để nói rõ gradebook cố ý không dùng `scoped_classes` mà chỉ kiểm quyền sở hữu — kèm lý do. Nếu người dùng muốn ngược lại thì đổi 1 dòng code thay vì đổi spec.

Mọi mục còn lại đều là code sai spec → sửa code.

---

## 3. Backend

Toàn bộ theo TDD: viết test đỏ trước, sửa code, chạy `python manage.py test classes`.

### 3.1 Phân tách 404/403 (B1)

`classes/views.py:348`:

```python
def teacher_gradebook_class(user, class_id):
    if user.role == User.Role.ADMIN:
        return None                      # -> 403: thấy được nhưng không mở được
    return get_object_or_404(Class.objects.filter(teacher=user), id=class_id)
```

Student và Teacher không sở hữu đều rơi vào `filter(teacher=user)` rỗng → `404`. Chỉ Admin trả `None` → view giữ nguyên `403`.

Test: 4 case — owner `200`, other teacher `404`, student `404`, admin `403`. Test hiện có ở `test_classes.py:681-687` assert `403` cho other_teacher/admin, phải cập nhật.

### 3.2 Thứ tự hàng và cột (B3, B4)

- Students: `.order_by("full_name", "id")` — `id` làm tiebreak vì `full_name` nullable (test hiện có tạo user không có tên). Khớp thứ tự của danh sách bài nộp ở [04 §2.2].
- Assignments: `.order_by("created_at", "id")` — spec nói `created_at`, không nói `id`; hai thứ tự trùng nhau trong thực tế nhưng viết đúng theo cột được nêu.

Test: tạo 3 students tên `C`, `A`, `B` → response phải theo `A, B, C`.

### 3.3 `is_active` vào serializer (B5)

`classes/serializers.py:125` thêm `"is_active": student.is_active` vào dict student. Trường này có sẵn trên `User`, không thêm query.

Nhân tiện gọn hoá phần tính `score` (hiện gọi `latest_submissions.get(...)` 3 lần và dùng `getattr`/`hasattr` lồng nhau):

```python
def _cell(self, assignment, student, now, latest_submissions):
    submission = latest_submissions.get((assignment.id, student.id))
    grade = getattr(submission, "grade", None) if submission else None
    return {
        "assignment_id": assignment.id,
        "learning_state": assignment_learning_state(assignment, student, now, submission),
        "score": grade.total_score if grade else None,
    }
```

`Grade` là OneToOne `related_name="grade"` (`grading/models.py:12`); `getattr(..., None)` nuốt `RelatedObjectDoesNotExist` đúng như `hasattr` cũ, nhưng chỉ resolve một lần.

### 3.4 CSV đúng nhãn + tải file (B6, B7)

Thêm một chỗ duy nhất dịch state → nhãn hiển thị, đặt cạnh `assignment_learning_state` trong `assignments/services.py` để không nhân đôi quy tắc (frontend sẽ có bản của nó, xem §4.2 — chấp nhận vì đó là ranh giới ngôn ngữ, không phải logic):

```python
LEARNING_STATE_LABELS = {"SUBMITTED": "Đã nộp", "OPEN": "Chưa nộp", "CLOSED": "Đã đóng"}
```

Trong `GradebookCsvView`:

```python
cell = str(grade["score"]) if grade["learning_state"] == "GRADED" else LEARNING_STATE_LABELS[grade["learning_state"]]
writer.writerow([..., *[csv_value(cell) for cell in cells]])
```

Lưu ý spec §6 cuối: guard là **per-cell**, không riêng cột điểm — nên bọc `csv_value()` cho cả ô state (hiện code bỏ qua). Vô hại nhưng đúng quy tắc đã viết.

Thêm header tải:

```python
response["Content-Disposition"] = f'attachment; filename="gradebook-{classroom.id}.csv"'
```

Tên file thuần ASCII, tránh phải encode RFC 5987 cho tên lớp tiếng Việt.

Test: cập nhật `test_gradebook_csv_is_utf8_private_safe_and_matches_roster` (`test_classes.py:750`) — assert `"Nguyễn Văn A,gradebook-student@example.test,91\r\n"` và `",gradebook-other-student@example.test,Chưa nộp\r\n"`, cộng assert `Content-Disposition` và BOM.

### 3.5 Test mới cần thêm

- `is_active=False` → student vẫn có mặt, cờ `is_active` là `False`.
- Student đã rời lớp → biến mất khỏi ma trận (spec §6).
- Bài tập tạo sau khi chấm → cột mới toàn `OPEN`/`CLOSED`, không recompute.
- Tên student bắt đầu bằng `=` → CSV có prefix `'`.

---

## 4. Frontend

### 4.1 Types (`frontend/src/types.ts`)

```ts
export type LearningState = "GRADED" | "SUBMITTED" | "OPEN" | "CLOSED";
export type GradebookCell = { assignment_id: number; learning_state: LearningState; score: number | null };
export type GradebookAssignment = { id: number; title: string; maximum_score: number };
export type GradebookStudent = { id: number; full_name: string | null; email: string; is_active: boolean; grades: GradebookCell[] };
export type GradebookResponse = { assignments: GradebookAssignment[]; students: GradebookStudent[] };
```

### 4.2 `lib/api.ts`

```ts
export function classGradebookPath(classId: number): string { return `/classes/${classId}/gradebook`; }
export function gradebookCsvUrl(classId: number): string { return `/api/classes/${classId}/gradebook.csv`; }
export async function downloadGradebookCsv(classId: number): Promise<void> { /* … */ }
```

Auth là Bearer token trong `sessionStorage` (xem `request()` và `downloadSubmission`), nên nút "Xuất CSV" **không thể** là `<a href>` thuần — phải `fetch` kèm `Authorization`, lấy blob, tạo `<a download>` rồi revoke. Tái dùng đúng khuôn `downloadSubmission` (`lib/api.ts:90`); cân nhắc tách helper `downloadBlob(url, filename)` dùng chung cho cả hai.

### 4.3 `pages/teacher/TeacherGradebookPage.tsx`

Theo khuôn `TeacherClassPage`: `useParams` lấy `classId`, `request<GradebookResponse>` trong `useEffect`, `Spinner` khi loading, `Alert` khi lỗi, `EmptyState` khi lớp chưa có bài tập hoặc chưa có học viên.

Nội dung:
- Header: `< Back` về `/teacher/classes/{id}`, tiêu đề `Bảng điểm: {tên lớp}`, phụ đề `Chỉ xem — không chấm điểm ở đây.` (tên lớp cần thêm một `request<ClassRow>(/classes/{id})`, giống `TeacherClassPage:46` — hoặc bàn với backend cho `class` vào payload gradebook; đề xuất fetch riêng để không đổi contract).
- Bảng ma trận: cột đầu `Học viên` sticky-left, mỗi assignment một cột với header là `<Link to={/teacher/assignments/{id}}>{title} ({maximum_score})</Link>`. Cell **không** phải link.
- Cell render: `score` khi `GRADED`, ngược lại nhãn từ map `{SUBMITTED:"Đã nộp", OPEN:"Chưa nộp", CLOSED:"Đã đóng"}`. Không bao giờ có ô rỗng/`-`.
- Student `is_active === false` → `<Badge className="badge-disabled">đã tắt</Badge>` cạnh tên, giống roster.
- Nút `[ Xuất CSV ]` góc dưới phải, gọi `downloadGradebookCsv`, hiện `Toast` khi lỗi.

Ma trận unpaginated và có thể rộng → bọc bảng trong `overflow-x: auto`, cột tên `position: sticky; left: 0`. `DataTable` hiện tại (`components/Table.tsx`) dựng cột tĩnh; cột gradebook là động theo dữ liệu — kiểm tra `Column[]` có nhận mảng dựng runtime không, nếu vướng thì viết `<table>` riêng trong page thay vì bẻ cong `DataTable`.

### 4.4 Route + điều hướng

- `App.tsx`: `<Route path="/teacher/classes/:classId/gradebook" element={<TeacherGradebookPage />} />`, đặt cạnh các route teacher khác (`App.tsx:60-64`), trong cùng guard `RequireRole` mà nhóm teacher đang dùng.
- `TeacherClassPage`: thêm nút/link `Bảng điểm` ở header lớp — nếu không có lối vào thì trang mới coi như không tồn tại với người dùng.

### 4.5 Test (`frontend/src/test/pages/TeacherGradebookPage.test.tsx`)

Mock `fetch`, render với `MemoryRouter`:
1. Bốn state render đúng bốn nhãn; `GRADED` chỉ hiện số, không hiện chữ "Đã chấm".
2. Header cột là link tới `/teacher/assignments/{id}`; cell không phải link.
3. Student `is_active:false` có tag `đã tắt`, và điểm vẫn hiển thị.
4. Lớp không có assignment → empty state, không render bảng rỗng.
5. Lỗi tải → `Alert`, không văng unhandled rejection (bài học từ commit `7452b9d`).
6. Nút CSV gọi đúng URL kèm header `Authorization`.

---

## 5. Cập nhật spec

Sau khi code xong, sửa `docs/overview/06-gradebook.md`:
- §5: viết lại điều kiện của `teacher_gradebook_class` cho khớp quyết định ở §2 (gradebook cố ý không qua `scoped_classes`, kèm lý do lớp đã kết thúc vẫn phải xuất được điểm).
- §3: ghi rõ CSV trả `Content-Disposition: attachment`, và các nhãn tiếng Việt là do **server** sinh cho CSV còn JSON trả enum thô để client tự dịch.
- §2.1: ghi rõ payload có `is_active` cho tag `đã tắt`.

---

## 6. Thứ tự thực thi

1. Backend B1 (404/403) + test — chạm auth, làm trước và một mình.
2. Backend B3/B4/B5 (thứ tự + `is_active`) + test — cùng chạm `gradebook_data`/serializer, gộp một commit.
3. Backend B6/B7 (CSV nhãn + attachment) + test.
4. Frontend types + `lib/api.ts` helper.
5. Frontend `TeacherGradebookPage` + route + lối vào từ `TeacherClassPage`.
6. Frontend tests.
7. Cập nhật spec §5/§3/§2.1.

Verify cuối: `python manage.py test classes assignments` và `npm run build && npm test`.
