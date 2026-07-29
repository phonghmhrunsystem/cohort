# Feature: Classes & Enrollment

Part of [00-system-overview](00-system-overview.md). Backend app: `classes/` (models `Class`, `Enrollment`). Frontend: `AdminClassesPage`, `AdminClassPage`, `TeacherClassesPage`, `TeacherClassPage` (Students tab), `StudentClassesPage`, `StudentClassPage`.

## 1. Purpose

A Class is the container for a teacher's cohort: it has a schedule window, an assigned teacher, and an enrolled student roster. Admin owns Class lifecycle and roster; teachers and students only view what's scoped to them.

A Class is never deleted. The only lifecycle levers are the `starts_at`/`ends_at` window and the `is_active` (Bật/Tắt) flag — see [5](#5-key-functions--rules).

## 2. Screens (ASCII)

### 2.1 Admin — Classes list (`/admin/classes`)

```
+-----------------------------------------------------------------------------------------------+
| Classes                                                              [ Create Class ]           |
|                                                                                                   |
| Search tên lớp [____________]  Giáo viên [____________]                    [ Search ]           |
|                                                                                                   |
| Tên lớp                  | Giáo viên       | Ngày bắt đầu | Ngày kết thúc | HV | Action          |
| AI Engineering Cohort 5  | Nguyen Giao Vien| 2026-07-01   | 2026-09-30    | 24 | View Edit Tắt   |
| AI Engineering Cohort 6  | Tran Giao Vien  | 2026-10-01   | 2026-12-31    | 0  | View Edit Bật   |
|   (đã tắt)                                                                                       |
+-----------------------------------------------------------------------------------------------+
                                              [ < 1 2 3 ... > ]   (10 classes/page)

Create/Edit dialog: name, description, starts_at, ends_at, teacher
(admin picks from active Teacher accounts).
```
- Search tên lớp + Giáo viên are filters; nothing searches on change. Search only fires when `[ Search ]` is clicked (not real-time). Both are server-side (`?q=`, `?teacher=`), never client-side filtering of a loaded page.
- Table columns: Tên lớp, Giáo viên, Ngày bắt đầu (`starts_at`), Ngày kết thúc (`ends_at`), HV (`student_count`), Action.
- Paginated, 10 classes/page.
- Rows with `is_active = false` are shown to admin with an "(đã tắt)" marker — admin is the only role that sees them at all.
- Action buttons per row: `View`, `Edit`, `Bật/Tắt`.
  - `View` → `/admin/classes/{id}`.
  - `Edit` → Create/Edit dialog. Disabled once the Class has ended, except for extending `ends_at` (see [5](#5-key-functions--rules)).
  - `Bật/Tắt` → toggles `is_active`. **`Tắt` is only offered while `now < starts_at`**; once a Class has started the button is disabled with a tooltip. `Bật` (re-enable) is always available.

### 2.2 Admin — Class detail (`/admin/classes/{id}`)

```
+------------------------------------------------------------------------+
| < Classes                                        [ Edit Class ]        |
| AI Engineering Cohort 5                                                 |
| description...                                                           |
| Giáo viên: Nguyen Giao Vien              2026-07-01 → 2026-09-30         |
|                                                                           |
| Students (24)                                       [ Edit roster ]     |
| Search Students [__________________]                    [ Search ]      |
|                                                                           |
| Tên user     | Quê quán  | SĐT        | Ngày ghi danh | Action           |
| Nguyen Van A | Ha Noi    | 09xxxxxxxx | 2026-07-02    | View Remove      |
| Tran Thi B   | Da Nang   | 09xxxxxxxx | 2026-07-02    | View             |
+------------------------------------------------------------------------+
                                    [ < 1 2 > ]   (10 students/page)

Edit roster dialog: search Students, checkbox list, [Save roster]
-> replaces the whole roster in one PUT.
```
- Table columns: Tên user (`full_name`), Quê quán (`hometown`), SĐT (`phone`), Ngày ghi danh (`enrollments.created_at`), Action.
- Paginated, 10 students/page. Search is server-side (`?q=` over `full_name` + `email`).
- Action buttons per row: `View`, `Remove`.
  - `View` → `/admin/classes/{id}/students/{student_id}` (read-only profile + per-Class progress).
  - `Remove` → removes that student from the roster. **Hidden**, not just rejected, when the student already has a submission in this Class or the Class has ended (row 2 above) — the server still enforces it with a `422` (see [6](#6-edge-cases)).
- `Edit roster` is hidden once the Class has ended.
- Changing the teacher happens in the `Edit Class` dialog (see [5](#5-key-functions--rules)) — it is allowed until the Class ends.

### 2.3 Teacher — My Classes (`/teacher/classes`)

```
+------------------------------------------------------------+
| My Classes                                                   |
| Search Classes [_______________]           [ Search ]        |
|                                                                |
| Tên lớp                 | Số học viên | Action              |
| AI Engineering Cohort 5 | 24          | View                |
+------------------------------------------------------------+
                            [ < 1 2 > ]   (10 classes/page)
```
- Table columns: Tên lớp, Số học viên (`student_count`), Action.
- Action: `View` → opens `/teacher/classes/{id}`.
- Only Classes where `teacher_id = me` **and** `is_active = true` appear.

### 2.4 Teacher — Class detail, Students tab (`/teacher/classes/{id}?tab=students`)

```
+------------------------------------------------------------+
| < Back                                                        |
| AI Engineering Cohort 5                                       |
|                                                                |
| [Students] [Assignments]                     [ Bảng điểm ]   |
|                                                                |
| Search Student [______________]              [ Search ]       |
| Đã ghi danh 24 · Đã nộp 18 · Đã chấm 12                        |
|                                                                |
| Tên          | SĐT        | Action  |
| Nguyen Van A | 09xxxxxxxx | View    |
+------------------------------------------------------------+
                            [ < 1 2 3 > ]   (10 students/page)
```
- Table columns: Tên (`full_name`), SĐT (`phone`), Action.
- Action: `View` → student profile with per-Class progress (Nộp bài / Chấm điểm).
- The three header counts (`enrolled_students`, `submitted_students`, `graded_students`) are whole-roster totals computed by the server and are **not** affected by the search box or the current page.
(Assignments tab: see [03-assignments-and-rubrics](03-assignments-and-rubrics.md). Bảng điểm: see [06-gradebook](06-gradebook.md).)

### 2.5 Student — My Classes / Class detail

```
/student/classes
+-----------------------------------------------------+
| My Classes                                            |
|                                                         |
| Tên lớp                 | Giáo viên        | Action    |
| AI Engineering Cohort 5 | Nguyen Giao Vien | View      |
+-----------------------------------------------------+

/student/classes/{id}
+--------------------------------+
| < Back                          |
| AI Engineering Cohort 5          |
| Tiến độ: 2/5 đã chấm · Hạn ...   |
|                                  |
| Giáo viên: Nguyen Giao Vien      |
|                                  |
| [ Class resources ] [ Assignments ]  <- tabs          |
|                                  |
| Class resources tab:            |
| - Slide deck (external link)    |
+--------------------------------+

/student/classes/{id} — Assignments tab
+--------------------------------------------------------------------------------+
| Tên assignment | Hạn nộp                     | Trạng thái | Điểm    | Action     |
| Homework 1     | 2026-08-15 20:00 · Còn 3 ngày| Chưa nộp   | —       | View  Nộp bài      |
| Homework 2     | 2026-08-10 20:00 · Đã nộp   | Đã nộp     | —       | View  Xem lịch sử  |
| Homework 3     | 2026-08-01 20:00            | Đã chấm    | 85/100  | View  Xem kết quả  |
| Homework 4     | 2026-07-20 20:00            | Đã đóng    | —       | View       |
+--------------------------------------------------------------------------------+
```
- Classes list table columns: Tên lớp, Giáo viên, Action (`View`). Not paginated — a student's enrolled Class count is small.
- Class detail: Giáo viên shows name only (no mailto link). Class resources and Assignments are separate tabs.
- "Tiến độ: 2/5 đã chấm · Hạn ..." comes from `graded_count`/`assignment_count` + `next_due_at` on `GET /api/classes/{id}` ([§3](#3-api)) — one number pair for the whole Class, not a count of the rows currently rendered below. `next_due_at` is the earliest `due_at` still in the future; with none left the Hạn segment is dropped rather than showing a past date.
- Only Classes the student is enrolled in **and** with `is_active = true` appear.
- Assignments tab columns: Tên assignment, Hạn nộp (`due_at` + `deadline_badge`), Trạng thái (`learning_state`), Điểm (`score`/`maximum_score`, `—` until graded), Action.
- Action: `View` is always present and always goes to `/student/assignments/{id}`. The second button is a shortcut to the same page and is driven by `learning_state` (see [03](03-assignments-and-rubrics.md)) — `OPEN` → `Nộp bài`, `SUBMITTED` → `Xem lịch sử`, `GRADED` → `Xem kết quả`, `CLOSED` → no second button, the reason (`closure_reason`) shows as a tooltip on the Trạng thái cell. A `Nộp bài` button that is dead on half the rows is worse than no button.
- Not paginated, no search — assignment counts per Class are small. Sorted by `due_at` ascending.
- Submitting always happens on the detail page, never inline in this table — see [04](04-submissions.md).

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/classes` | Authenticated | Scoped: Admin=all, Teacher=owned+active, Student=enrolled+active. `?q=` name search, `?teacher=` name/id (Admin only), `?page=` (10/page). Each row carries `student_count` |
| POST | `/api/classes` | Admin | Create Class (name, description, starts_at, ends_at, teacher_id) |
| GET | `/api/classes/{id}` | Authenticated | Scoped read. **Student caller** additionally gets `assignment_count`, `graded_count` and `next_due_at` — the "Tiến độ 2/5 đã chấm · Hạn ..." line in [§2.5](#25-student--my-classes--class-detail). Server-computed over the whole Class, not derived client-side from the assignments list |
| PATCH | `/api/classes/{id}` | Admin | `422` if Class has ended (`is_ended`) — **except** an `ends_at`-only extension (see [5](#5-key-functions--rules)). `teacher_id` may be changed while the Class has not ended |
| PATCH | `/api/classes/{id}/status` | Admin | Toggle `is_active`. `422` when disabling a Class that has already started (`now >= starts_at`); enabling is always allowed |
| GET | `/api/classes/{id}/students` | Admin, Teacher | Roster + progress counts + whole-roster totals. `?q=`, `?page=` (10/page). `?candidates=1` (Admin only) lists active Students to add, with `?q=` search |
| GET | `/api/classes/{id}/students/{student_id}` | Admin, Teacher | One student's profile + per-Class progress |
| POST | `/api/classes/{id}/enrollments` | Admin | Add one student; `422` if Class ended or already enrolled |
| DELETE | `/api/classes/{id}/enrollments/{student_id}` | Admin | Remove one; `422` if Class ended or student has any submission in it |
| PUT | `/api/classes/{id}/enrollments` | Admin | Replace whole roster with `student_ids[]`; same removal guard applied per removed student |
| GET/POST | `/api/classes/{id}/resources` | Teacher, Student / Teacher (owner) | Class resources — see [07](07-notifications-and-resources.md) |
| GET | `/api/classes/{id}/gradebook`, `/api/classes/{id}/gradebook.csv` | Teacher (owner) | Read-only gradebook — see [06](06-gradebook.md) |

Removed: `GET /api/classes/{id}/enrollments` — it returned the same roster as `GET /api/classes/{id}/students` with the same access rules and the same `?q=`, minus the progress counts. `/enrollments` keeps only `POST`/`PUT`/`DELETE` (roster writes); every roster read goes through `/students`.

Roster payloads (`/students`, `?candidates=1`) return `id, full_name, email, phone, hometown, enrolled_at, is_active` plus `submitted_assignments` / `graded_assignments` on the enrolled variants.

## 4. DB

**`classes`**

| Field | Notes |
|---|---|
| `teacher_id` | FK → users, `PROTECT`. Reassignable by admin until the Class ends |
| `name`, `description` | name 2–100 chars, unique per teacher is **not** enforced |
| `starts_at`, `ends_at` | define the coursework-open window used by [03](03-assignments-and-rubrics.md)/[04](04-submissions.md); `starts_at < ends_at` |
| `is_active` | default `true`. `false` hides the Class from Teacher and Student scopes entirely; admin still sees it. Only togglable to `false` before `starts_at` |
| `created_at`, `updated_at` | audit/ordering |

**`enrollments`**

| Field | Notes |
|---|---|
| `classroom_id`, `student_id` | unique together |
| `created_at` | when the student was enrolled — shown as "Ngày ghi danh", also the roster's secondary sort key |

**`users`** — see [01-auth-and-accounts](01-auth-and-accounts.md). This feature adds one field to it:

| Field | Notes |
|---|---|
| `hometown` | nullable, tỉnh/thành. Shown as "Quê quán" on the admin roster; editable in the account create/edit and profile forms in [01](01-auth-and-accounts.md) |

**`class_resources`** — same Django app (`classes/models.py`) but documented in [07-notifications-and-resources](07-notifications-and-resources.md).

## 5. Key functions / rules

- `scoped_classes(user)` (`classes/views.py`) — single source of truth for "which Classes can this user see"; reused by `assignments`, `submissions`, `grading` views for their own scoping. Admin sees all; Teacher sees `teacher=user, is_active=True`; Student sees `enrollments__student=user, is_active=True`.
- `is_open(class_) = is_active and starts_at <= now < ends_at` — the window every coursework check in [03](03-assignments-and-rubrics.md)/[04](04-submissions.md)/[05](05-grading-and-results.md) builds on.
- `is_ended(class_) = now >= ends_at` — blocks Class edits, teacher reassignment, and roster changes (add/remove), but not reads.
- **`ends_at` extension escape hatch** — a `PATCH` on an ended Class is accepted when it changes **only** `ends_at` and the new value is in the future. Without this, a mistyped `ends_at` freezes a Class permanently (no delete, no edit, no roster change). The extension is audited as `class.reopened`.
- **`ends_at` floor** — `ends_at` can never be moved before the latest Assignment `due_at` in that Class.
- **Teacher reassignment** — admin may change `teacher_id` while `not is_ended`. New teacher must be an active `TEACHER` account. Writes a `class.teacher_changed` audit entry with both ids ([08 §4](08-audit-log.md#4-db)) and, in the same transaction, one `CLASS_UNASSIGNED` notification to the outgoing teacher and one `CLASS_ASSIGNED` to the incoming one via `notify_user` ([07 §5](07-notifications-and-resources.md#5-key-functions--rules)) — not the roster fan-out, which can only address enrolled students. Students are not notified. Grades and assignments already authored by the previous teacher are untouched and keep their original author. Reassignment is the answer to "the teacher left" — there is no Class delete/clone path.
- **`Bật/Tắt` (`is_active`)** — `false` means the Class does not exist as far as teachers and students are concerned: it disappears from their lists, every `/classes/{id}/...` route returns `404` for them, and no notification fan-out targets it. Disabling is only allowed **before** `starts_at`, so a running Class can never be pulled out from under people mid-course; re-enabling has no such restriction (an admin must always be able to undo a mistaken `Tắt`). `is_active` is independent of the time window: a disabled Class still "ends" on schedule.
- **"Active Class" for account operations** — [01](01-auth-and-accounts.md) blocks disabling/deleting an account tied to an active Class. Active there means `is_active = true AND now < ends_at`. A disabled or ended Class never blocks an account operation.
- `student_has_submission(class_, student_id)` — guards roster removal so a student who already submitted work can't be silently un-enrolled (their submissions would become orphaned from a visible roster).
- `EnrollmentView.put` (roster replace) — locks the `Class` row (`select_for_update`, with an `UPDATE ... SET id=id` fallback on SQLite since it doesn't support row locks the same way) and the current `Enrollment` rows before diffing add/remove sets, so two concurrent roster saves can't race.
- `students_progress_queryset(class_)` — annotates each student with `submitted_assignments` / `graded_assignments` counts via `Count(..., distinct=True)`; the frontend must never recompute these client-side from a partial (searched or paginated) list.
- **Roster membership is `is_active`-blind.** Every roster-shaped read — `/students`, the header counts, the gradebook in [06](06-gradebook.md) — includes every enrolled student regardless of the student's `is_active`, and carries `is_active` in the payload so the UI can mark them. Filtering disabled students out of one list and not another is what makes "Đã ghi danh 24" disagree with a 23-row gradebook. `is_deleted` accounts are excluded everywhere. In practice this only surfaces on ended Classes, since [01](01-auth-and-accounts.md) refuses to disable a student enrolled in an active Class.

## 6. Edge cases

- Removing a student who has a submission → `422` even before the Class ends; the UI hides the `Remove` button for those rows rather than letting it fail.
- Roster replace (`PUT`) that would remove a submitted student → whole request `422`s, no partial apply.
- Non-owning teacher hitting any `/classes/{id}/...` route for a Class they don't teach → `404` (not `403`), because `scoped_classes` filters them out before the object lookup. Same `404` for any teacher/student hitting a Class with `is_active = false`.
- `Tắt` on a Class that already started → `422`; the button is disabled in the UI.
- Enrolling into a disabled Class is allowed (it hasn't started yet, so it's still being set up); those students simply see nothing until it's re-enabled.
- Changing `teacher_id` on an ended Class → `422`.
- `PATCH` on an ended Class touching anything other than `ends_at` → `422`, even if `ends_at` is also in the payload.
- Extending `ends_at` re-opens coursework for the Class; assignments whose own `due_at` has passed stay closed — the window is an `AND`, not an override.
- A student disabled or soft-deleted after enrolling: disabled → still on the roster, marked "đã tắt"; soft-deleted (`is_deleted`) → excluded from every roster read, but the `Enrollment` row and their submissions are kept for audit.
- Searching the roster narrows the table only; the "Đã ghi danh / Đã nộp / Đã chấm" totals stay whole-roster.
