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
| Chỉ xem — không chấm điểm ở đây.                                      |
|                                                                        |
| Học viên            | HW1 (100) | HW2 (100) | HW3 (100) |             |
| Nguyen Van A        | 82        | Đã nộp    | Chưa nộp  |             |
| Pham Thi D  đã tắt  | 74        | Đã nộp    | Đã đóng   |             |
| Tran Thi B          | Đã nộp    | 95        | Chưa nộp  |             |
|                                                                        |
|                                                    [ Xuất CSV ]        |
+--------------------------------------------------------------------+
```

- **Cell = score if graded, otherwise the `learning_state` label** — the same four labels as everywhere else ([03 §2.2](03-assignments-and-rubrics.md#22-student--assignments-tab-studentclassesid)), server-computed by the same `assignment_learning_state` the student's own screens use:

| `learning_state` | Cell |
|---|---|
| `GRADED` | `score` (the number alone — "Đã chấm 82" says the same thing twice) |
| `SUBMITTED` | `Đã nộp` |
| `OPEN` | `Chưa nộp` |
| `CLOSED` | `Đã đóng` — deadline or Class window passed with nothing handed in |

  `Chưa nộp` and `Đã đóng` are different facts: the first is still fixable by the student, the second never will be. One label for both would hide exactly the row a teacher chases.
- **No empty/`-` cell.** Every (student, assignment) pair has a state, so every cell has a label; a dash would read as missing data rather than as a state.
- **Column header links to `/teacher/assignments/{id}`** ([04 §2.2](04-submissions.md#22-teacher--assignment-submissions-teacherassignmentsid)) — the matrix is where a teacher notices "HW2 has 8 ungraded", and grading lives one click away. Cells themselves are not links: there is no per-cell grade route ([05 §2.1](05-grading-and-results.md#21-teacher--grade-submission-teacherassignmentsidgradesubmissionid) is reached from the assignment page), and half the cells would have nowhere to point.
- **Rows sorted by student name**, same order as the submissions list ([04 §2.2](04-submissions.md#22-teacher--assignment-submissions-teacherassignmentsid)) — a teacher moving between the two screens reads the same sequence of names on both.
- **Columns in `created_at` ascending** (oldest left), unlike the Assignments table's newest-first ([03 §2.1](03-assignments-and-rubrics.md#21-teacher--assignments-tab-teacherclassesidtabassignments)). A matrix is read left-to-right as the course progressed; a task list is read top-down as "what did I just make".
- Disabled accounts stay in the matrix tagged `đã tắt` — each `students[]` row carries `is_active` so the tag comes from the payload, never from a client-side guess — same as the submissions list ([02 §6](02-classes-and-enrollment.md#6-edge-cases)) — they were graded on work handed in while active, and dropping the row would silently drop those scores out of the export.
- Score column header carries the assignment's `maximum_score`, always `100` ([03 §4](03-assignments-and-rubrics.md#4-db)).

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/classes/{id}/gradebook` | Owning Teacher | JSON matrix: `assignments[]` (`created_at` ascending), `students[]` (by name, with `is_active`), per-cell `{score, learning_state}`. Unpaginated |
| GET | `/api/classes/{id}/gradebook.csv` | Owning Teacher | Same data as CSV download, UTF-8 with BOM for Excel; `Content-Disposition: attachment; filename="gradebook-{id}.csv"` |

The JSON returns **raw enums** (`GRADED`/`SUBMITTED`/`OPEN`/`CLOSED`) and each client translates them; the CSV is the one server-rendered surface, so it writes the Vietnamese labels itself (`LEARNING_STATE_LABELS` in `assignments/services.py`, next to the state rule it labels). That is a language boundary, not a duplicated rule — the states themselves are still computed in exactly one place. The filename is plain ASCII on purpose: a Vietnamese Class name in `Content-Disposition` would need RFC 5987 encoding for no gain. Without the `attachment` header the browser renders the CSV inline, which is not "Xuất CSV"; the frontend still has to `fetch` it with the Bearer token and hand the bytes to a blob download, since a plain `<a href>` carries no `Authorization`.

Unpaginated on both axes, for the same reason the submissions list is ([04 §3.1](04-submissions.md#31-the-teacher-list-is-roster-shaped)) — a matrix split across pages is not a matrix, and Class sizes are tens. `ponytail:` paginate students if a Class ever passes a few hundred, not before.

## 4. DB

No dedicated table — this is a read-model computed on the fly from `classes`, `assignments`, `submissions` (latest version per pair via a correlated subquery), and `grading.grades`/`assignments.assignment_grades` for state/score. See `03-assignments-and-rubrics.md`'s `assignment_learning_state` for the state values reused here.

## 5. Key functions / rules

- `teacher_gradebook_class(user, class_id)` — resolves the Class for the caller, and the two failure modes get **different** statuses, per the convention in [00 §6](00-system-overview.md#6-cross-cutting-rules-apply-to-every-feature):
  - **Non-owning Teacher, or Student** → `404`. The lookup is `Class.objects.filter(teacher=user)`, so the Class is not-in-scope for them, exactly like every other `/classes/{id}/...` route ([02 §6](02-classes-and-enrollment.md#6-edge-cases)). A teacher must not be able to probe which Class ids exist.
  - Deliberately **not** `scoped_classes` ([02 §5](02-classes-and-enrollment.md#5-key-functions--rules)), the one read that departs from it: `scoped_classes` filters `is_active=True` for a Teacher, which would `404` the gradebook of a Class that has ended or been disabled — precisely when the export matters most, as the term's final tally. Ownership is still enforced; only the active-window filter is dropped, and the screen writes nothing.
  - **Admin** → `403`. Admin *can* see the Class everywhere else, so `404` here would be a lie. Gradebook is explicitly teacher-only — the one Class read Admin is refused — and `403` says that plainly.

  That split is the whole convention in one function: `404` means "not yours to know about", `403` means "yours to know about, not yours to open".
- `gradebook_data(classroom)`:
  - Fetches all **currently enrolled** students, ordered by name — including disabled (`is_active=False`) accounts, which the serializer flags so the UI can tag them `đã tắt`. Soft-deleted users are excluded, same rule as the submissions list ([04 §2.2](04-submissions.md#22-teacher--assignment-submissions-teacherassignmentsid)).
  - Fetches the Class's assignments `created_at` ascending — column order is a query concern, not a frontend sort.
  - For each `Assignment`, prefetches only the **latest** submission per student via a correlated subquery (`Subquery(latest)`), avoiding an N+1 or an accidental "all versions" leak into the matrix. The teacher sees no version here either ([04 §1](04-submissions.md#1-purpose)) — the matrix carries state and score, never a version count.
  - Builds a `(assignment_id, student_id) -> submission` lookup, passed into `GradebookSerializer` context along with `now` so each cell's `learning_state` comes from the same `assignment_learning_state` the student's own screens use. One function, one truth: a cell reading `Đã nộp` here and `Đã chấm` on the student's page would be a bug in a duplicated rule, so the rule isn't duplicated.
- The gradebook **writes nothing and grades nothing**. Grading has exactly one entry point ([05 §2.1](05-grading-and-results.md#21-teacher--grade-submission-teacherassignmentsidgradesubmissionid)), reached from the assignment page, because grading needs the file in front of the teacher and this screen deliberately has no file.
- `GradebookCsvView` reuses `gradebook_data` (no separate query path) and streams a `csv.writer` response; `csv_value()` prefixes any cell starting with `= + - @` with a `'` — CSV/formula-injection guard for anyone opening the export in Excel/Sheets.

## 6. Edge cases

- Assignment with a submission but no grade yet → cell shows `Đã nộp`, no score. Same cell whether or not the assignment has a rubric — the rubric only affects *how* a score is produced ([05 §5](05-grading-and-results.md#5-key-functions--rules)), never the state.
- Student never submitted and the deadline has passed → `Đã đóng`, not `0`. Nobody can be graded without a submission ([05 §5.2](05-grading-and-results.md#52-grading-is-a-one-way-door-in-three-directions)), so a zero here would be a number the system invented. Teachers reading the export as a final tally have to treat `Đã đóng` as "no work", which is what it says.
- Student unenrolled after grading occurred: gradebook only ever queries *currently* enrolled students, so a removed student simply disappears from the matrix — same rule as the submissions counts ([04 §2.2](04-submissions.md#22-teacher--assignment-submissions-teacherassignmentsid)). Their `grades` row still exists for audit/history, just not surfaced here.
- Student's account disabled after being graded → row stays, tagged `đã tắt`, scores intact. Dropping them would quietly change the class's totals on an admin action that has nothing to do with their work.
- Assignment created after some students were graded on earlier ones → a new all-`Chưa nộp` column appears on the right; nothing recomputes, since every cell is derived per pair at read time.
- Expired assignment still ungraded → cells stay `Đã đóng`/`Đã nộp` indefinitely; the assignment being frozen ([03 §5](03-assignments-and-rubrics.md#5-key-functions--rules)) does not stop the teacher grading those `Đã nộp` cells later ([05 §5.1](05-grading-and-results.md#51-what-grading-is-not-gated-on)), which is why the column header stays linked.
- CSV export access follows the same `teacher_gradebook_class` check as the JSON view — no separate, weaker auth path for the download link.
- A student name starting with `=` or `+` → escaped by `csv_value()` like any other cell; the guard is per-cell, not per-score-column.
