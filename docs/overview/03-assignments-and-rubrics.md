# Feature: Assignments & Rubrics

Part of [00-system-overview](00-system-overview.md). Backend app: `assignments/`. Frontend: `TeacherClassPage` (Assignments tab), `StudentClassPage` (Assignments section).

## 1. Purpose

Teacher-authored coursework items within a Class, with an optional rubric. Drives what a student sees as "open to submit", "already submitted", "graded", or "closed" — the **learning state**.

## 2. Screens (ASCII)

### 2.1 Teacher — Assignments tab (`/teacher/classes/{id}?tab=assignments`)

```
+------------------------------------------------------------------------+
| Assignments                                      [ Tạo assignment ]     |
|                                                                         |
| Tên          | Ngày tạo   | Hạn nộp            | Trạng thái | Đã nộp | Action  |
|--------------|------------|--------------------|------------|--------|---------|
| Homework 1   | 2026-07-20 | 2026-08-15 20:00   | Đang mở    | 12/24  | (👁)(✎) |
|              |            | Còn 3 ngày         |            |        |         |
| Homework 2   | 2026-06-18 | 2026-07-01 20:00   | Hết hạn    | 22/24  | (👁)(✎) |
|              |            | Đã hết hạn         |            |        | ✎ grey  |
+------------------------------------------------------------------------+
```

`(👁)` / `(✎)` = icon-only buttons (eye = Xem, pencil = Sửa), `aria-label`/`title` carry the Vietnamese name — the table has no visible button text.

- Same table shape as the Student view (§2.2) — one row per assignment, no cards.
- **Ngày tạo** = `created_at`, date only. Default sort is `-created_at` (newest first) so a freshly created assignment lands at the top.
- **Trạng thái** is teacher-side, not `learning_state`: `Đang mở` (Class open and `now < due_at`), `Hết hạn` (`due_at` passed), `Đã đóng` (Class window closed).
- **Đã nộp** = `submitted_count/enrolled_count`; a `graded_count` badge appears next to it once grading starts. Both come from the list endpoint (§3), not from N extra calls.
- **`Xem`** goes to `/teacher/assignments/{id}` — the single teacher assignment page, which is assignment detail *and* the submissions list in one (see [04 §2.2](04-submissions.md#22-teacher--assignment-submissions-teacherassignmentsid)). There is no separate "view assignment" screen; `Sửa rubric` lives in that page's header, not in this table.
- **`Sửa` is disabled once `due_at` has passed**, with a tooltip ("Assignment đã hết hạn, không thể chỉnh sửa."). Nothing survives the deadline — title, description, `due_at` and rubric are all frozen. A deadline can only be moved *before* it passes; there is no gia hạn after the fact, so a teacher who wants more time has to change `due_at` while the assignment is still `Đang mở`.
- **Loading/error/empty states** (both this table and the Class header above it): a `Spinner` while fetching, an `Alert` if the fetch fails (no stuck spinner), an `EmptyState` ("No assignments.") when the list comes back empty.

```
Create dialog:  Title [____________]           (editable)
                Description [________]          (editable)
                Due at [datetime-local]          (editable)
                Max score: 100                   (static text, not an input)

Edit dialog:    Title [____________] GREYED OUT  (locked once created — not editable)
                Description [________]           (editable)
                Due at [datetime-local]          (editable, must stay in the future)
                Max score: 100                   (static text, not an input)

Only reachable while now < due_at; after that the whole dialog is unreachable.

Edit rubric dialog (in the assignment page header):
  Total: 70 / 100        Còn lại: 30      <- red until it sums to 100
  Criterion [___________] Points [1-100] [Xóa]
  Criterion [___________] Points [1-100] [Xóa]
  [ Add criterion ]  [ Chia đều ]  [ Dùng mẫu mặc định ]
  [ Save rubric ]  <- disabled unless total == 100 and at least 1 criterion
```

- **`Title` is locked (disabled input) on the edit dialog** — only `Description` and `Due at` can change after creation. Doc previously implied all three fields were freely editable; the code only disables `title`.

- `Dùng mẫu mặc định` fills three criteria — Đúng yêu cầu 40 / Chất lượng 30 / Trình bày 30 — editable afterwards. Rubrics are optional; an assignment with no criteria is graded by a manual total ([05](05-grading-and-results.md)).
- `Chia đều` splits 100 across the current criteria (remainder to the first).
- Keep rubrics to 3–5 criteria. No per-criterion level descriptors (Xuất sắc/Khá/Đạt/Kém) — score plus `feedback` covers it.

### 2.2 Student — Assignments tab (`/student/classes/{id}`)

Full mock in [02 §2.5](02-classes-and-enrollment.md#25-student--my-classes--class-detail). A table of Tên assignment / Hạn nộp / Trạng thái / Điểm / Action, where every row always shows a `Xem` icon button (eye icon, first action) plus a second, state-driven action:

| `learning_state` | Trạng thái | Second action | Điểm |
|---|---|---|---|
| `OPEN` | Chưa nộp | `Nộp bài` | `—` |
| `SUBMITTED` | Đã nộp | `Xem lịch sử` | `—` |
| `GRADED` | Đã chấm | `Xem kết quả` | `—`* |
| `CLOSED` | Đã đóng | none — `closure_reason` as a tooltip ("Class has ended." / "Deadline has passed.") | `—` |

*`Điểm` currently renders `—` unconditionally for every row, `GRADED` included — the column isn't wired to the grade yet, so this table never actually shows a score. Flagging as a gap, not intended behavior; the score only surfaces today on the student assignment detail page ([04](04-submissions.md)).

Every action lands on the same page, `/student/assignments/{id}` ([04](04-submissions.md)) — currently a stub there, full detail lives in [04](04-submissions.md); the second button only anchors to the relevant section. `deadline_badge` renders next to `due_at` in the Hạn nộp cell. `Xem` is an icon button like the teacher table; `Nộp bài` is also icon (upload); `Xem lịch sử`/`Xem kết quả` render as text buttons, not icons. Same loading/error/empty-state pattern as §2.1 (spinner → alert on failure, no stuck spinner; empty state when the list is empty).

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/classes/{class_id}/assignments` | Teacher (own), Student (enrolled) | Student caller: `learning_state`, `deadline_badge`. Teacher caller: `submitted_count`, `graded_count`, `enrolled_count` for the table |
| POST | `/api/classes/{class_id}/assignments` | Owning Teacher | `422` if Class not open (`is_open`) |
| GET | `/api/assignments/{id}` | Teacher/Student in scope | |
| PATCH | `/api/assignments/{id}` | Owning Teacher | `422` if Class not open, or if `due_at` has passed (`EXPIRED_MESSAGE`) — including a `due_at`-only body. A new `due_at` must itself be in the future |
| PUT | `/api/assignments/{id}/rubric` | Owning Teacher | Replaces all criteria; `422` if Class not open, if `due_at` has passed, or if already graded |

## 4. DB

**`assignments`**

| Field | Notes |
|---|---|
| `classroom_id` | FK → classes |
| `title`, `description`, `due_at` | |
| `maximum_score` | fixed `100`, `editable=False` |
| `created_at` | `auto_now_add`; shown as the Ngày tạo column and drives the default `-created_at` ordering |

**`rubric_criteria`**

| Field | Notes |
|---|---|
| `assignment_id` | FK → assignments |
| `title`, `maximum_score` | server validates the set sums to 100 on save |

**`assignment_grades`** (lock table, not the actual grade record — see [05](05-grading-and-results.md))

| Field | Notes |
|---|---|
| `assignment_id`, `student_id` | unique together — existence here means "graded, no more writes for this pair" |
| `score` | denormalized copy of the final total, used for quick progress counts |

## 5. Key functions / rules

- `is_open(classroom) = classroom.is_active and classroom.starts_at <= now < classroom.ends_at` — gates assignment create/update and rubric edit. One definition, shared with [00 §6](00-system-overview.md#6-cross-cutting-rules-apply-to-every-feature) and [02 §5](02-classes-and-enrollment.md#5-key-functions--rules). In practice the `is_active` term never fires on these paths — `scoped_classes` has already 404'd a disabled Class before the view runs ([02 §5](02-classes-and-enrollment.md#5-key-functions--rules)) — but it stays in the function so there is exactly one window rule in the system to reason about, not two that happen to agree.
- `is_expired(assignment, now) = now >= assignment.due_at` — second gate, on top of `is_open`. Once expired the assignment is **fully frozen**: no field changes, rubric included. Students have already been graded against this wording and this deadline, so nothing about it can move afterwards — an expired assignment is a closed record, not a draft.
  - Consequence, by design: **there is no post-hoc gia hạn.** A teacher who needs more time must push `due_at` out *before* the original one lands. Once it passes, the only path to a later deadline is a new assignment.
  - A `due_at` written while the assignment is still open must itself be a future timestamp — a teacher cannot expire an assignment early by backdating it.
- `assignment_learning_state(assignment, student, now, latest_submission=...)` (`assignments/services.py`) — the single function that decides a student's per-assignment state:
  - `GRADED` if the latest submission has a `grade` relation.
  - else `SUBMITTED` if a submission exists and the Class+due_at window is still open, `OPEN` if none exists and window is open.
  - else `CLOSED`.
- `closure_reason(assignment, now)` — human-readable reason for `CLOSED` state: Class not started / Class ended / deadline passed, checked in that order.
- `deadline_badge(due_at, now)` — Vietnamese relative-time badge: "Đã hết hạn" (expired), "Còn hôm nay" (today), "Còn N ngày" (N days left).
- Rubric replace is blocked once any `grading.Grade` exists for the assignment (`ALREADY_GRADED_MESSAGE`), independent of the Class-open check — grading is a one-way door across the whole assignment, not per student.
- Creating an assignment fans out a `Notification` (`ASSIGNMENT_CREATED`) to every enrolled student — see [07](07-notifications-and-resources.md).

## 6. Edge cases

- Editing an assignment or rubric after the Class window closes → `422`, even if the assignment's own `due_at` hasn't passed yet.
- Any edit after `due_at` — title, description, `due_at` itself, rubric — → `422`, even though the Class is still open. `Sửa` and `Sửa rubric` are disabled in this state; the API still re-checks (the disabled button is not the enforcement).
- Teacher realises the deadline was too tight *after* it passed → nothing to do on this assignment; create a new one. Stated here because it's the predictable support ticket, not an oversight.
- A request racing the deadline (sent at `due_at - 1s`, arriving after) → `422`; the check reads `now` server-side at handling time, so the boundary belongs to the server clock, not the browser's.
- Pushing `due_at` beyond the Class's `ends_at` while still open → accepted by this rule but pointless; `can_submit` ([04 §5](04-submissions.md#5-key-functions--rules)) still stops at `ends_at`.
- Rubric criteria total ≠ 100 → rejected by `RubricSerializer` validation, `422`. Client also blocks it earlier: the Points input is `min=1 max=100`, so a 0/negative/>100 single criterion never reaches the total check.
- A teacher viewing a Student's `learning_state`/`deadline_badge` never sees them — those fields are only populated when `context["student"]` is set (Student caller).
