# Design: Dashboard theo role

Ngày: 2026-08-03. Branch nền: `feature/improve_ui` @ `f22602e`.

## 1. Vấn đề

`frontend/src/pages/DashboardPage.tsx` hiện là 7 dòng stub: một `Card` với tiêu đề "Dashboard" và một câu mô tả đổi theo role. Đây là màn hình đầu tiên mọi người thấy sau khi đăng nhập (`/` redirect về `/dashboard`) và nó không trả lời được câu hỏi nào.

Không có endpoint tổng hợp nào trong `backend/`. Ba role cần ba câu trả lời khác nhau:

- **Admin** không biết hệ thống đang có bao nhiêu account, bao nhiêu lớp đang chạy, và chuyện gì vừa xảy ra.
- **Teacher** không biết còn bao nhiêu bài chờ chấm, và bài nào sắp tới hạn.
- **Student** không biết bài nào chưa nộp và hạn khi nào.

Ghép ở client không khả thi: `/api/users` và `/api/classes` đều phân trang, và không có endpoint nào trả count toàn hệ thống cho Admin.

## 2. Phạm vi

**Trong phạm vi:** một endpoint `GET /api/dashboard`, ba biến thể payload theo role, ba component dashboard ở frontend, test backend + frontend.

**Ngoài phạm vi:** biểu đồ (không thêm thư viện chart), nút shortcut hành động, tuỳ biến dashboard theo người dùng, khoảng thời gian tuỳ chọn.

**Phụ thuộc:** phần audit của dashboard Admin ăn `audit/labels.py` và bảng map action → câu tiếng Việt do `docs/plans/08-audit-log-plan.md` tạo ra. **Plan 08 phải chạy xong trước.**

## 3. Kiến trúc

### 3.1 App mới `backend/dashboard/`

Dashboard đọc từ `accounts`, `classes`, `assignments`, `submissions`, `grading`, `audit` — nó không thuộc bounded context nào trong số đó. Nhét view này vào một app sẵn có sẽ đặt nó dưới sai chủ sở hữu, nên nó được một app riêng:

| File | Trách nhiệm |
|---|---|
| `dashboard/__init__.py` | |
| `dashboard/services.py` | `admin_dashboard(user)`, `teacher_dashboard(user)`, `student_dashboard(user)` — toàn bộ truy vấn nằm ở đây |
| `dashboard/serializers.py` | ba serializer, một cho mỗi hình payload |
| `dashboard/views.py` | `DashboardView` — chọn hàm theo `request.user.role`, không có logic truy vấn |
| `dashboard/urls.py` | `path("dashboard", DashboardView.as_view())` |
| `dashboard/tests/test_dashboard.py` | |

**Không có `models.py` và không có thư mục `migrations/`** — app này không sở hữu bảng nào. Vẫn thêm `"dashboard"` vào `INSTALLED_APPS` (để `manage.py test dashboard` tìm thấy test) và `include(dashboard_urls)` vào `config/urls.py`. `makemigrations` sẽ không sinh gì cho nó; nếu có, ai đó đã thêm model vào sai chỗ.

### 3.2 Endpoint

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/dashboard` | Mọi role đã đăng nhập | Payload đổi hình theo role của **người gọi** |

`permission_classes = [IsAuthenticated]` — dùng lớp `IsAuthenticated` của `accounts.permissions`, tức người đang bị `must_change_password` cũng bị chặn (`403`), giống mọi endpoint khác ngoài bốn cái public.

Endpoint **không nhận** query param nào. Role đọc từ `request.user.role`; một Teacher không có cách nào xin payload của Admin.

Trường `role` nằm trong response để frontend phân biệt hình payload — nó là bản sao của `/api/auth/me`, có mặt để payload tự mô tả được chính nó chứ không phải nguồn sự thật thứ hai.

### 3.3 Ngân sách truy vấn

Mỗi role tối đa 8 query, **cố định** — không phụ thuộc số lớp, số bài hay số học viên. Mọi con số tính bằng `aggregate()`/`annotate()` ở DB; không có vòng lặp Python nào chạy query. Test dùng `assertNumQueries` để ghim ngưỡng này; nếu ai đó thêm một vòng lặp, test đỏ.

### 3.4 Tái sử dụng, không sao chép

- `classes.views.scoped_classes(user)` đã ép đúng scope cho cả ba role (Admin thấy tất cả, Teacher chỉ lớp mình dạy, Student chỉ lớp mình học, cả hai role sau đều đã lọc `is_active=True`). Dashboard gọi hàm này, **không** tự viết filter — nếu không, luật scope sẽ có hai bản và chúng sẽ lệch nhau.
- `classes.views.is_open(class_)` nhận một instance nên không dùng được trong `WHERE`. Thêm `open_class_q(now)` vào `classes/views.py` ngay dưới `is_open`, trả về `Q(is_active=True, starts_at__lte=now, ends_at__gt=now)`, và **viết lại `is_open` để dùng chung định nghĩa đó** — cửa sổ lớp phải có đúng một định nghĩa trong code.
- Nhãn audit lấy từ `audit.labels.resolve_labels(logs)` do plan 08 tạo.

## 4. Payload

### 4.1 Admin

```json
{
  "role": "ADMIN",
  "accounts": { "admins": 2, "teachers": 5, "students": 84 },
  "classes": { "running": 3, "scheduled": 1, "ended": 7, "disabled": 2 },
  "recent_audit": [
    { "id": 812, "action": "class.created", "target_label": "Web Development K18A",
      "actor": { "id": 1, "full_name": "Le Quoc Bao", "role": "ADMIN" },
      "created_at": "2026-08-03T10:15:00Z" }
  ]
}
```

- `accounts.*` đếm `User` với `is_deleted=False`, nhóm theo `role`, một query `values("role").annotate(Count("id"))`. Account bị vô hiệu hoá (`is_active=False`) **vẫn được đếm** — nó vẫn tồn tại và vẫn cần được quản lý; chỉ soft-delete mới biến mất.
- `classes.*` là bốn nhóm **loại trừ lẫn nhau**, cộng lại bằng tổng số lớp:
  - `disabled`: `is_active=False` (bất kể ngày tháng)
  - `running`: `is_active=True` và `starts_at <= now < ends_at`
  - `scheduled`: `is_active=True` và `now < starts_at`
  - `ended`: `is_active=True` và `now >= ends_at`
- `recent_audit`: 5 dòng mới nhất theo `(-created_at, -id)`, đúng thứ tự của `/api/audit-logs`. Trả `action` thô kèm `target_label` đã phân giải; frontend dùng chung `lib/auditActions.ts` của plan 08 để render câu, và giữ nguyên đường lui in mã dotted khi gặp action lạ.

### 4.2 Teacher

```json
{
  "role": "TEACHER",
  "cards": { "my_classes": 4, "running_classes": 2, "open_assignments": 6,
             "pending_grading": 11, "students": 63 },
  "pending": [
    { "submission_id": 991, "assignment_id": 42, "assignment_title": "Lab 3 - Responsive Layout",
      "class_id": 7, "class_name": "Web Development K18A",
      "student": { "id": 55, "full_name": "Tran Minh Anh" },
      "submitted_at": "2026-08-03T09:40:00Z" }
  ],
  "due_soon": [
    { "assignment_id": 44, "title": "Lab 4 - Flexbox", "class_id": 7,
      "class_name": "Web Development K18A", "due_at": "2026-08-05T17:00:00Z",
      "submitted_count": 12, "student_count": 30 }
  ]
}
```

- `my_classes` = số lớp `scoped_classes` trả về (đã lọc `is_active=True`); `running_classes` là tập con thoả `open_class_q`.
- `open_assignments` = assignment thuộc lớp đang mở và `due_at > now`.
- `students` = số học viên **distinct** trong các lớp của tôi. Một người học hai lớp của cùng teacher được đếm một lần: thẻ này trả lời "tôi đang dạy bao nhiêu người", không phải "có bao nhiêu suất ghi danh".
- `pending_grading` = số cặp `(assignment, student)` có ít nhất một `Submission` và **chưa** có `AssignmentGrade`. Đếm theo cặp, không theo số bản nộp: một học viên nộp lại ba lần vẫn là một việc phải làm.
- `pending`: 10 cặp mới nhất, mỗi cặp lấy **bản nộp mới nhất** (`version` lớn nhất), sắp xếp theo `submitted_at` desc. `submission_id` để link thẳng tới trang chấm.
- `due_soon`: assignment còn hạn trong 7 ngày tới, thuộc lớp đang mở, sắp theo `due_at` asc, tối đa 5. `submitted_count` là số học viên **đã nộp** (distinct student), `student_count` là sĩ số lớp — hai con số này là thứ khiến dòng này đáng đọc.

### 4.3 Student

```json
{
  "role": "STUDENT",
  "cards": { "my_classes": 2, "not_submitted": 3, "graded": 8, "average_score": 82.5 },
  "todo": [
    { "assignment_id": 44, "title": "Lab 4 - Flexbox", "class_id": 7,
      "class_name": "Web Development K18A", "due_at": "2026-08-05T17:00:00Z" }
  ],
  "recent_grades": [
    { "assignment_id": 42, "title": "Lab 3 - Responsive Layout", "class_id": 7,
      "class_name": "Web Development K18A", "score": 85, "maximum_score": 100,
      "graded_at": "2026-08-02T15:10:00Z" }
  ]
}
```

- `not_submitted` = assignment thuộc lớp đang mở, `due_at > now`, chưa có `Submission` nào của tôi. **Bài quá hạn không được đếm** — không còn hành động nào làm được với nó, và đưa nó vào thẻ "chưa nộp" biến thẻ đó thành một con số không bao giờ về 0. Trạng thái quá hạn vẫn hiện trong tab lớp sẵn có.
- `graded` = số `AssignmentGrade` của tôi. `average_score` = trung bình `score`, làm tròn 1 chữ số; `null` khi chưa có điểm nào — frontend hiện dấu `—`, không hiện `0`.
- `todo`: cùng điều kiện với `not_submitted`, sắp theo `due_at` asc, tối đa 10.
- `recent_grades`: 5 điểm mới nhất theo `Grade.created_at` desc.

## 5. Luật

1. **Server ép scope.** Teacher chỉ thấy dữ liệu của lớp `teacher_id = me`; Student chỉ thấy lớp mình có `Enrollment`. Lớp `is_active=False` vô hình với cả hai (`scoped_classes` đã làm việc này).
2. **Cửa sổ lớp áp dụng như mọi nơi khác.** `is_open(class) = is_active and starts_at <= now < ends_at`.
3. **Dashboard chỉ đọc.** Không có `write_audit` nào — audit ghi write, không ghi read (08 §5.1). Không có endpoint POST/PUT nào trong app này.
4. **Không có dữ liệu nào ở đây mà role đó không lấy được qua endpoint khác.** Dashboard là tổng hợp cho tiện, không phải kênh lộ dữ liệu mới. Ngoại lệ có chủ ý: các con số tổng của Admin (`accounts`, `classes`) — Admin vốn được phép đọc toàn bộ hai bảng đó qua `/api/users` và `/api/classes`, ở đây chỉ là dạng đếm.
5. `401` khi chưa đăng nhập, `403` khi đang bị `must_change_password`. Không có `404` — endpoint không nhận tham số nào để mà trỏ trượt.

## 6. Frontend

| File | Trách nhiệm |
|---|---|
| `frontend/src/types.ts` | thêm `AdminDashboard`, `TeacherDashboard`, `StudentDashboard`, và union `DashboardData` phân biệt bằng `role` |
| `frontend/src/components/StatCard.tsx` | tạo: số lớn + nhãn + tone (`default` / `warn`), dùng token màu sẵn có |
| `frontend/src/pages/DashboardPage.tsx` | sửa: fetch `/api/dashboard`, xử lý loading/lỗi, rồi chuyển tiếp theo `data.role` |
| `frontend/src/pages/dashboard/AdminDashboardView.tsx` | tạo |
| `frontend/src/pages/dashboard/TeacherDashboardView.tsx` | tạo |
| `frontend/src/pages/dashboard/StudentDashboardView.tsx` | tạo |

Ba view là component thuần: nhận payload đã fetch qua props, không tự gọi API. Nhờ vậy test chúng chỉ cần dựng props, và `DashboardPage` là chỗ duy nhất biết về mạng.

Danh sách dùng `Table`, trạng thái rỗng dùng `EmptyState` (Teacher không còn bài chờ chấm là tin tốt, phải nói ra chứ không để bảng trống), `Card`/`Badge` cho phần còn lại. **Không thêm thư viện chart.**

Mỗi dòng trong `pending` / `due_soon` / `todo` / `recent_grades` là một link tới trang chi tiết đã có (trang chấm, trang assignment). Dashboard không dựng màn hình mới nào.

## 7. Test

**Backend** (`backend/dashboard/tests/test_dashboard.py`):

- Ba test payload, một cho mỗi role, dựng dữ liệu đủ để mọi con số khác 0 và khác nhau (một payload toàn số 1 không phân biệt được các trường bị hoán vị).
- Rò rỉ scope: Teacher A không thấy lớp/bài nộp của Teacher B; Student không thấy assignment của lớp mình không học.
- Lớp `is_active=False`: bài của nó không lọt vào bất kỳ con số nào của Teacher/Student, nhưng **vẫn** được Admin đếm vào `classes.disabled`.
- `pending_grading` không đếm cặp đã có `AssignmentGrade`.
- `pending_grading` đếm một học viên nộp 3 bản là **một** việc.
- `average_score` là `null` khi chưa có điểm.
- Bốn nhóm `classes.*` của Admin cộng lại bằng tổng số lớp.
- `assertNumQueries` cho mỗi role.
- `401` khi ẩn danh, `403` khi `must_change_password=True`.

**Frontend**:

- `frontend/src/test/pages/DashboardPage.test.tsx` — render đúng view theo `role`, có trạng thái loading và lỗi.
- Một test cho mỗi view: số hiện đúng, danh sách rỗng ra `EmptyState`, `average_score: null` hiện `—`.

## 8. Rủi ro đã biết

- **`pending_grading` là truy vấn nặng nhất** — nó đi qua `Submission` × `AssignmentGrade` trên toàn bộ lớp của một teacher. Với dữ liệu demo thì không sao. Nếu chậm, cách sửa là index `(assignment_id, student_id)`, không phải cache — số này phải đúng ngay lúc đọc.
- **Dashboard sẽ lệch với thực tế nếu ai đó đổi luật cửa sổ lớp mà quên `open_class_q`.** Đó là lý do §3.4 gộp `is_open` và `open_class_q` về một định nghĩa thay vì viết điều kiện `WHERE` mới.
- **Thứ tự thi hành:** dashboard Admin không hoàn chỉnh cho tới khi plan 08 xong. Nếu cần chạy dashboard trước, `recent_audit` phải tạm thời trả mảng rỗng — nhưng như vậy sẽ phải sửa lại serializer sau, nên làm đúng thứ tự rẻ hơn.
