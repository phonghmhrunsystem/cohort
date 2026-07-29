# Feature: Assignments & Rubrics

Part of [00-system-overview](00-system-overview.md). Backend app: `assignments/`. Frontend: `TeacherClassPage` (Assignments tab), `StudentClassPage` (Assignments section).

## 1. Purpose

Teacher-authored coursework items within a Class, with an optional rubric. Drives what a student sees as "open to submit", "already submitted", "graded", or "closed" — the **learning state**.

## 2. Screens (ASCII)

### 2.1 Teacher — Assignments tab (`/teacher/classes/{id}?tab=assignments`)

```
+------------------------------------------------------------+
| Assignments                          [ Create Assignment ] |
|                                                                |
| +------------------------------------------------------------+
| | Homework 1                                                  |
| | description text...                                          |
| | Due 2026-08-15 20:00                                         |
| | [Edit] [Edit rubric] [View submissions]                     |
| +------------------------------------------------------------+

Create/Edit dialog: title, description, due_at. (max_score fixed 100,
not editable.)

Edit rubric dialog:
  Total: 100 / 100                     <- red until it sums to 100
  Criterion [___________] Points [___] [Xóa]
  Criterion [___________] Points [___] [Xóa]
  [ Add criterion ]
  [ Save rubric ]  <- disabled unless total == 100
```

### 2.2 Student — Assignments section (`/student/classes/{id}`)

```
Assignments
+------------------------------------------------------------+
| Homework 1                                                   |
| Due 2026-08-15 20:00     [Còn 3 ngày]                        |
| state=OPEN      -> [ Nộp bài ]                                |
| state=SUBMITTED -> [ Xem lịch sử nộp ]                        |
| state=GRADED    -> [ Xem kết quả ]                            |
| state=CLOSED    -> "Class has ended." / "Deadline has passed."|
+------------------------------------------------------------+
```

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/classes/{class_id}/assignments` | Teacher (own), Student (enrolled) | Includes `learning_state`, `deadline_badge` for a Student caller |
| POST | `/api/classes/{class_id}/assignments` | Owning Teacher | `422` if Class not open (`is_open`) |
| GET | `/api/assignments/{id}` | Teacher/Student in scope | |
| PATCH | `/api/assignments/{id}` | Owning Teacher | `422` if Class not open |
| PUT | `/api/assignments/{id}/rubric` | Owning Teacher | Replaces all criteria; `422` if Class not open or if already graded |

## 4. DB

**`assignments`**

| Field | Notes |
|---|---|
| `classroom_id` | FK → classes |
| `title`, `description`, `due_at` | |
| `maximum_score` | fixed `100`, `editable=False` |

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

- `is_open(classroom) = classroom.starts_at <= now < classroom.ends_at` — gates assignment create/update and rubric edit. Independent from each assignment's own `due_at`.
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
- Rubric criteria total ≠ 100 → rejected by `RubricSerializer` validation, `422`.
- A teacher viewing a Student's `learning_state`/`deadline_badge` never sees them — those fields are only populated when `context["student"]` is set (Student caller).
