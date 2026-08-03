# Teacher grade review — design

Date: 2026-08-01

## Problem

Three issues in the teacher grading flow:

1. **Download button is a full-width block.** `TeacherGradePage.tsx:114-119` renders the
   submission download as `<Button className="button-secondary">Tải</Button>`, which stretches
   across the card. Everywhere else in the app a per-item download is an `IconButton` with
   `DownloadIcon` (`LatestSubmissions.tsx:50`).

2. **A teacher cannot read back the feedback they wrote.** After grading, the grade page shows
   only `<Alert>Assignment này đã được chấm.</Alert>` — no score, no criteria, no feedback. The
   backend has no endpoint for it either: `GET /assignments/<id>/my-result` is student-only and
   returns 403 for a teacher.

3. **The gradebook page is nearly undiscoverable.** The only entry point is a button in the
   header of the class detail page (`TeacherClassPage.tsx:120`), sitting outside the
   Students / Assignments tabs where the eye scans.

The student side already renders feedback (`ResultBlock.tsx:48`) and is out of scope.

## Scope

In scope: teacher-facing changes only. The student result view must render identically after
this work.

Out of scope: any change to how grading itself works (grades stay immutable once submitted),
notifications, and the CSV export format.

---

## 1. Download button becomes an icon

`TeacherGradePage` — the submission card becomes a single flex row: file name, size, and
submission time on the left; an `IconButton` with `DownloadIcon` on the right. The
`button-secondary` block button is removed.

The accessible name stays "Tải" via `IconButton`'s `label` prop, which sets both `aria-label`
and `title`.

## 2. Teacher can review a grade

### Backend

New endpoint, added to `backend/grading/urls.py`:

```
GET /assignments/<assignment_id>/students/<student_id>/result
```

`AssignmentStudentResultView`:

- 403 unless `request.user.role == User.Role.TEACHER`.
- Looks up `Grade` filtered by `assignment_id`, `student_id`, and
  `assignment__classroom__teacher=request.user`, so a teacher cannot read another teacher's
  class. A grade outside the teacher's classes is a 404, not a 403 — it must not leak whether
  the grade exists.
- 404 when the submission has not been graded yet.
- Returns `GradeSerializer` data, which already carries `feedback` and `scores`.

`CriterionScoreSerializer` gains two read-only fields: `criterion_title` and `maximum_score`,
sourced from the related criterion. This makes a grade response self-describing, so the dialog
does not need a second request for the assignment's rubric. Existing fields are unchanged, so
the student `ResultBlock` keeps working as-is.

### Frontend

- **`GradeDetail`** — a new presentational component holding the markup currently inside
  `ResultBlock`: total score, per-criterion rows, feedback, and the graded-at line. It takes a
  `Grade` plus an optional `filename`, and renders it. No fetching. Criterion titles and maxima
  come from the grade payload itself, thanks to the serializer change above, so the component
  needs no rubric prop.
- **`ResultBlock`** keeps its fetch, resolves the submission filename as it does today, and
  passes both to `GradeDetail`. Student output is identical to today. The teacher dialog has no
  submission list on hand, so it omits `filename` and the graded-at line drops the
  "chấm trên …" clause. `ResultBlock`'s `criteria` prop becomes dead once titles arrive with the
  grade, so it is dropped from `ResultBlockProps` and from the `StudentAssignmentPage` call
  site.
- **`GradeResultDialog`** — takes `assignmentId`, `studentId`, `open`, `onClose`. Fetches the
  new endpoint when opened, shows `Spinner` while loading, `Alert` on failure, and `GradeDetail`
  on success. Built on the existing `Dialog` component.

### Where it hangs off

- **Gradebook cell.** A cell with `learning_state === "GRADED"` renders as a button showing the
  score, which opens `GradeResultDialog` for that student and assignment. Non-graded cells stay
  static text.
- **`LatestSubmissions`.** A row with `graded === true` gets an `IconButton` with `EyeIcon`
  labelled "Xem kết quả" next to the existing download button. Today a graded row offers only
  download, since the grade action is hidden once grading is done.

## 3. The gradebook becomes a tab

`TeacherClassPage` gains a third tab, "Bảng điểm", alongside Students and Assignments, reached
at `?tab=gradebook`. The header button is removed.

The body of `TeacherGradebookPage` moves into `<GradebookPanel classId={...} />`, which owns the
gradebook fetch, the table, the CSV export button, and the empty state. The panel renders inside
the tab.

The old route `/teacher/classes/:classId/gradebook` stays registered and renders
`<Navigate replace to="/teacher/classes/:classId?tab=gradebook" />`, so existing links and
bookmarks keep working. `TeacherGradebookPage.tsx` is deleted once its contents live in the
panel.

The panel no longer fetches the class record — the surrounding page already has it, and the
page heading covers the class name.

---

## Data flow

```
Gradebook cell (assignment_id, student_id)  ─┐
LatestSubmissions row (assignmentId,        ─┴─> GradeResultDialog
                       row.student_id)              │
                                                    ├─ GET /assignments/<a>/students/<s>/result
                                                    └─> GradeDetail

StudentAssignmentPage ──> ResultBlock ── GET /assignments/<a>/my-result ──> GradeDetail
```

Both entry points already hold the assignment id and student id, so one endpoint keyed on
`(assignment, student)` serves both. `Grade` is unique per that pair.

## Error handling

- Dialog fetch failure: `Alert` inside the dialog, dialog stays open so the user can close it
  deliberately. No toast.
- A 404 (not yet graded) is not reachable from either entry point, since both only offer the
  action on graded rows. It still renders the same alert rather than crashing.
- The gradebook panel keeps the current behaviour: a load failure replaces the table with an
  `Alert`; a CSV export failure raises an error toast.

## Testing

Backend (`backend/grading/tests/`):

- teacher of the class gets 200 with feedback and per-criterion scores
- a teacher from another class gets 404
- a student gets 403
- an ungraded submission gets 404
- the serializer includes `criterion_title` and `maximum_score`

Frontend:

- `GradeResultDialog` renders score, criteria, and feedback from a mocked response
- the dialog shows an alert when the request fails
- clicking a graded gradebook cell opens the dialog; a non-graded cell is not clickable
- the "Xem kết quả" button appears on graded rows in `LatestSubmissions` and opens the dialog
- `TeacherClassPage` shows the gradebook tab and renders the panel at `?tab=gradebook`
- the old `/gradebook` route redirects to `?tab=gradebook`
- the student result view still renders score, criteria, and feedback (regression guard on the
  `ResultBlock` / `GradeDetail` split)

`TeacherGradebookPage.test.tsx` is rewritten against `GradebookPanel`, keeping its existing
coverage of the table, the empty state, the load failure, and the CSV export.
