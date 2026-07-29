# Feature: Gradebook

Part of [00-system-overview](00-system-overview.md). Backend: `classes/views.py` (`GradebookView`, `GradebookCsvView`) — same app as Classes, split out here because it's a distinct read-only screen. Frontend: `TeacherGradebookPage`.

## 1. Purpose

Read-only, matrix view of every student × assignment for a Class, for the owning teacher only: at a glance, who has submitted / been graded / not yet acted, per assignment. Exportable to CSV for offline use.

## 2. Screens (ASCII)

### 2.1 Teacher — Gradebook (`/teacher/classes/{id}/gradebook`)

```
+--------------------------------------------------------------------+
| < Back                                                                |
| Bảng điểm: AI Engineering Cohort 5                                    |
| Read-only learning progress for this Class.                           |
|                                                                        |
|                    | HW1 (100) | HW2 (100) | HW3 (100) |              |
| Nguyen Van A       | 82        | Đã nộp    | Chưa nộp  |              |
| Tran Thi B         | Chưa chấm | 95         | -          |              |
|                                                                        |
|                                                    [ Xuất CSV ]        |
+--------------------------------------------------------------------+
```
Cell shows `learning_state: score` when scored, otherwise just the state label ("submitted / not graded", "not submitted", etc., server-computed).

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/classes/{id}/gradebook` | Owning Teacher | JSON matrix: `assignments[]`, `students[]`, per-cell `{score, learning_state}` |
| GET | `/api/classes/{id}/gradebook.csv` | Owning Teacher | Same data as CSV download, UTF-8 with BOM for Excel |

## 4. DB

No dedicated table — this is a read-model computed on the fly from `classes`, `assignments`, `submissions` (latest version per pair via a correlated subquery), and `grading.grades`/`assignments.assignment_grades` for state/score. See `03-assignments-and-rubrics.md`'s `assignment_learning_state` for the state values reused here.

## 5. Key functions / rules

- `teacher_gradebook_class(user, class_id)` — `403` unless caller is the owning `TEACHER` (Admin does **not** get gradebook access — gradebook is explicitly teacher-only, unlike most other Class reads which Admin can also see).
- `gradebook_data(classroom)`:
  - Fetches all enrolled active students, ordered by id.
  - For each `Assignment`, prefetches only the **latest** submission per student via a correlated subquery (`Subquery(latest)`), avoiding an N+1 or an accidental "all versions" leak into the matrix.
  - Builds a `(assignment_id, student_id) -> submission` lookup, passed into `GradebookSerializer` context along with `now` so it can derive each cell's `learning_state` consistently with the Assignments feature.
- `GradebookCsvView` reuses `gradebook_data` (no separate query path) and streams a `csv.writer` response; `csv_value()` prefixes any cell starting with `= + - @` with a `'` — CSV/formula-injection guard for anyone opening the export in Excel/Sheets.

## 6. Edge cases

- Assignment with no rubric and no grade yet, but a submission exists → cell shows the submitted-not-graded state, no score.
- Student unenrolled after grading occurred: gradebook only ever queries *currently* enrolled active students, so a removed student simply disappears from the matrix (their grade row still exists in `grades` for audit/history purposes, just not surfaced here).
- CSV export access follows the same `teacher_gradebook_class` check as the JSON view — no separate, weaker auth path for the download link.
