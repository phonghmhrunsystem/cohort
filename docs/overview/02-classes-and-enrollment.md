# Feature: Classes & Enrollment

Part of [00-system-overview](00-system-overview.md). Backend app: `classes/` (models `Class`, `Enrollment`). Frontend: `AdminClassesPage`, `AdminClassPage`, `TeacherClassesPage`, `TeacherClassPage` (Students tab), `StudentClassesPage`, `StudentClassPage`.

## 1. Purpose

A Class is the container for a teacher's cohort: it has a schedule window, an assigned teacher, and an enrolled student roster. Admin owns Class lifecycle and roster; teachers and students only view what's scoped to them.

## 2. Screens (ASCII)

### 2.1 Admin — Classes list (`/admin/classes`)

```
+------------------------------------------------------------+
| Classes                                   [ Create Class ] |
| Create Classes and manage enrollment.                       |
|                                                                |
| +------------------------------------------------------------+
| | AI Engineering Cohort 5                        [ Edit ]    |
| | starts 2026-07-01 -> ends 2026-09-30                        |
| +------------------------------------------------------------+

Create/Edit dialog: name, description, starts_at, ends_at, teacher
(admin picks from active Teacher accounts).
```

### 2.2 Admin — Class detail (`/admin/classes/{id}`)

```
+------------------------------------------------------------+
| < Classes                              [ Edit Class ]      |
| AI Engineering Cohort 5                                     |
| description...                                               |
|                                                                |
| Students                                    [ Edit roster ]  |
| Search enrolled Students [__________________]                |
| - Nguyen Van A                                                |
| - Tran Thi B                                                  |
+------------------------------------------------------------+

Edit roster dialog: search Students, checkbox list, [Save roster]
-> replaces the whole roster in one PUT.
```

### 2.3 Teacher — My Classes (`/teacher/classes`)

```
+------------------------------------------------------------+
| My Classes                                                   |
| Search Classes [_______________]                             |
|                                                                |
| [ AI Engineering Cohort 5           [ Open Class ] ]          |
+------------------------------------------------------------+
```

### 2.4 Teacher — Class detail, Students tab (`/teacher/classes/{id}?tab=students`)

```
+------------------------------------------------------------+
| < Back                                                        |
| AI Engineering Cohort 5                                       |
|                                                                |
| [Students] [Assignments]                     [ Bảng điểm ]   |
|                                                                |
| Search enrolled Students [______________]                     |
| Đã ghi danh 24 · Đã nộp 18 · Đã chấm 12                        |
| - Nguyen Van A                              [ Xem hồ sơ ]     |
|   Nộp bài: 3/5 · Chấm điểm: 2/5                                |
+------------------------------------------------------------+
```
(Assignments tab: see [03-assignments-and-rubrics](03-assignments-and-rubrics.md).)

### 2.5 Student — My Classes / Class detail

```
/student/classes                       /student/classes/{id}
+---------------------------+          +--------------------------------+
| My Classes                |          | < Back                          |
| [ Cohort 5  [Open Class] ]|          | AI Engineering Cohort 5          |
+---------------------------+          | Tiến độ: 2/5 đã chấm · Hạn ...   |
                                        |                                  |
                                        | Giáo viên                       |
                                        | Nguyen Giao Vien (mailto link)   |
                                        |                                  |
                                        | Class resources                 |
                                        | - Slide deck (external link)    |
                                        |                                  |
                                        | Assignments                     |
                                        | [ Assignment 1  [Nộp bài] ]     |
                                        +--------------------------------+
```

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/classes` | Authenticated | Scoped: Admin=all, Teacher=owned, Student=enrolled. `?q=` name search |
| POST | `/api/classes` | Admin | Create Class (name, description, starts_at, ends_at, teacher) |
| GET | `/api/classes/{id}` | Authenticated | Scoped read |
| PATCH | `/api/classes/{id}` | Admin | `422` if Class has ended (`is_ended`) |
| GET | `/api/classes/{id}/students` | Admin, Teacher | Roster + progress counts. `?candidates=1` (Admin only) lists active Students to add, with `?q=` search |
| GET | `/api/classes/{id}/students/{student_id}` | Admin, Teacher | One student's profile + per-Class progress |
| GET | `/api/classes/{id}/enrollments` | Admin, Teacher | Enrolled student list |
| POST | `/api/classes/{id}/enrollments` | Admin | Add one student; `422` if Class ended or already enrolled |
| DELETE | `/api/classes/{id}/enrollments/{student_id}` | Admin | Remove one; `422` if Class ended or student has any submission in it |
| PUT | `/api/classes/{id}/enrollments` | Admin | Replace whole roster with `student_ids[]`; same removal guard applied per removed student |
| GET | `/api/classes/{id}/resources` | Teacher, Student | List Class resources — see [07](07-notifications-and-resources.md) |
| POST | `/api/classes/{id}/resources` | Teacher (owner) | Create Class resource |

## 4. DB

**`classes`**

| Field | Notes |
|---|---|
| `teacher_id` | FK → users, `PROTECT` |
| `name`, `description` | |
| `starts_at`, `ends_at` | define the coursework-open window used by [03](03-assignments-and-rubrics.md)/[04](04-submissions.md) |

**`enrollments`**

| Field | Notes |
|---|---|
| `classroom_id`, `student_id` | unique together |

## 5. Key functions / rules

- `scoped_classes(user)` (`classes/views.py`) — single source of truth for "which Classes can this user see"; reused by `assignments`, `submissions`, `grading` views for their own scoping.
- `is_ended(class_) = now >= ends_at` — blocks Class edits and roster changes (add/remove), but not reads.
- `student_has_submission(class_, student_id)` — guards roster removal so a student who already submitted work can't be silently un-enrolled (their submissions would become orphaned from a visible roster).
- `EnrollmentView.put` (roster replace) — locks the `Class` row (`select_for_update`, with an `UPDATE ... SET id=id` fallback on SQLite since it doesn't support row locks the same way) and the current `Enrollment` rows before diffing add/remove sets, so two concurrent roster saves can't race.
- `students_progress_queryset(class_)` — annotates each student with `submitted_assignments` / `graded_assignments` counts via `Count(..., distinct=True)`; the frontend must never recompute these client-side from a partial list.

## 6. Edge cases

- Removing a student who has a submission → `422` even before the Class ends.
- Roster replace (`PUT`) that would remove a submitted student → whole request `422`s, no partial apply.
- Non-owning teacher hitting any `/classes/{id}/...` route for a Class they don't teach → `404` (not `403`), because `scoped_classes` filters them out before the object lookup.
