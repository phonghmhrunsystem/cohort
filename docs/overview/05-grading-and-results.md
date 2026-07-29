# Feature: Grading & Results

Part of [00-system-overview](00-system-overview.md). Backend app: `grading/`. Frontend: `GradePage`, `ResultPage`.

## 1. Purpose

One-time grading of a student's latest submission — by rubric (server sums criterion scores) or by manual total when the assignment has no rubric. Grading is final: it locks the (assignment, student) pair against further submissions and further grading, and it locks the assignment's rubric class-wide ([03 §5](03-assignments-and-rubrics.md#5-key-functions--rules)).

## 2. Screens (ASCII)

### 2.1 Teacher — Grade submission (`/teacher/assignments/{id}/grade/{submissionId}`)

Reached only from `[Chấm]` on the assignment page ([04 §2.2](04-submissions.md#22-teacher--assignment-submissions-teacherassignmentsid)). There is no route in for a student with no submission and none for an already-graded one — those rows have no `[Chấm]` button.

```
Rubric case:
+------------------------------------------------------------+
| < Back to assignment                                          |
| Chấm bài — Nguyen Van A                                       |
| Homework 1 · Hạn nộp 2026-08-15 20:00                         |
| homework_v3.pdf  2.4 MB  2026-08-14 21:02   [ Tải ]           |
|                                                                |
| Correctness (40)   Score [___]                                |
| Code quality (30)  Score [___]                                |
| Documentation (30) Score [___]                                |
| Feedback [_____________________________]                      |
| Total: 82 / 100  (server-calculated)                          |
| Chấm xong là chốt, không sửa lại được.                        |
| [ Chấm điểm ]                                                  |
+------------------------------------------------------------+

No-rubric case:
+------------------------------------------------------------+
| < Back to assignment                                          |
| Chấm bài — Nguyen Van A                                       |
| homework_v3.pdf  2.4 MB  2026-08-14 21:02   [ Tải ]           |
| Total score (0-100) [___]                                     |
| Feedback [_____________________________]                      |
| Chấm xong là chốt, không sửa lại được.                        |
| [ Chấm điểm ]                                                  |
+------------------------------------------------------------+
```

- The submission is shown but never rendered inline — `[ Tải ]` hits the same download endpoint as the list ([04 §3](04-submissions.md#3-api)), with the teacher's `{student_name}_{original_filename}` name. No PDF preview: the teacher opens the file in whatever reader they already trust.
- **No version number**, same as the list — the header shows filename and submitted-at, which is all a teacher acts on.
- `Chấm điểm` stays disabled until every rubric score (or the manual total) is filled, and reads `Đang chấm…` while in flight. Grading is one-way, so a double-click that lands twice is a `422`, not a second grade — but the busy state is what tells the teacher the first click landed.
- The one-way warning sits above the button, not in a confirm dialog. A dialog on every grade is 30 extra clicks per assignment; the line is there for the first-timer.
- On `422 NOT_LATEST_MESSAGE` (the student uploaded while this page was open) the form is replaced by "Học viên đã nộp bản mới, tải lại trang." with a refetch link — retrying the same `submissionId` can never work. On `422 ALREADY_GRADED_MESSAGE` the page shows the existing grade instead of the form. Field values are kept on any other failure so the teacher doesn't re-enter scores.
- **After a successful grade** the teacher goes back to `/teacher/assignments/{id}`, where the row now shows the score in place of `[Chấm]` — the next thing they want is the next student, not a receipt.
- A student tagged `đã tắt` ([04 §2.2](04-submissions.md#22-teacher--assignment-submissions-teacherassignmentsid)) grades exactly like any other: the work was handed in while the account was active.

### 2.2 Student — My result (section of `/student/assignments/{id}`)

Not a separate page. `Xem kết quả` from the Assignments table ([02 §2.5](02-classes-and-enrollment.md#25-student--my-classes--class-detail), [03 §2.2](03-assignments-and-rubrics.md#22-student--assignments-tab-studentclassesid)) and `View my result ->` in the assignment header ([04 §2.1](04-submissions.md#21-student--assignment-detail--submissions-studentassignmentsid)) both anchor to `#result` on the assignment page the student is already on. The block renders only when `learning_state` is `GRADED`, and it sits where the `Submit a file` block was — that block is hidden in this state anyway.

```
+------------------------------------------------------------+
| Kết quả                                                       |
| Điểm: 82 / 100                                                |
|                                                                |
| Correctness    32 / 40                                        |
| Code quality   26 / 30                                        |
| Documentation  24 / 30                                        |
|                                                                |
| Nhận xét: "Good structure, add tests next time."               |
| Đã chấm 2026-08-16 09:30 · chấm trên homework_v3.pdf          |
+------------------------------------------------------------+
```

- The per-criterion rows are omitted entirely when the assignment has no rubric — total and feedback only, not three empty lines.
- The last line names the file that was graded, because the student's history may hold several and "which one did the teacher read" is the first question a disputed score raises. It is `original_filename`, not a version number — the same string the student sees in their history rows.
- No "phúc khảo" / re-grade request button. There is no re-grade path in the system ([§5](#5-key-functions--rules)); a button that only opens a mail client is worse than the teacher's name being on the Class.

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| PUT | `/api/submissions/{submission_id}/grade` | Owning Teacher | Body: `total_score` (no rubric) or `scores: [{criterion_id, score}]` (rubric) + `feedback`. `422` if not latest version or already graded. **Never gated on `due_at` or the Class window** — see [§5](#5-key-functions--rules) |
| GET | `/api/assignments/{id}/my-result` | Owning Student | Returns the `Grade` + `CriterionScore` rows plus the graded submission's `original_filename`, `404` until graded |

Grading is the one write path in the system that stays open after an assignment expires. Everything else about an expired assignment is frozen ([03 §5](03-assignments-and-rubrics.md#5-key-functions--rules)) and submission is closed ([04 §5.2](04-submissions.md#52-the-two-stops-and-only-these-two)) — grading has to outlive both, or a deadline that passes at 20:00 would mean nothing in the class can ever be scored.

## 4. DB

**`grades`**

| Field | Notes |
|---|---|
| `assignment_id`, `student_id` | unique together — one grade per pair, ever |
| `teacher_id` | who graded |
| `submission_id` | `OneToOne` → the exact submission version that was graded |
| `total_score` | 0–100 |
| `feedback` | ≤2000 chars |
| `created_at` | |

**`criterion_scores`**

| Field | Notes |
|---|---|
| `grade_id`, `criterion_id` | unique together |
| `score` | validated ≤ that criterion's `maximum_score` |

**`assignment_grades`** — see [03](03-assignments-and-rubrics.md); created alongside `grades` as the lock/denormalized-score row read by submission and roster-progress logic.

## 5. Key functions / rules

- `grade_submission(*, teacher, submission, payload)` (`grading/services.py`) — the whole write path, inside one transaction:
  1. Re-fetches the submission scoped to `assignment__classroom__teacher=teacher` — ownership re-checked here, not trusted from the view.
  2. Confirms `submission.version == latest_version` for that (assignment, student) — `NOT_LATEST_MESSAGE` `422` otherwise. A teacher can only ever grade the current version.
  3. Confirms no `Grade` already exists for the pair — `ALREADY_GRADED_MESSAGE` `422` otherwise.
  4. `GradeInputSerializer` validates either the rubric `scores[]` (each within its criterion max, computes `total_score` as their sum) or a bare `total_score` when the assignment has no criteria.
  5. Creates `Grade`, then `CriterionScore` rows (if rubric), then the `AssignmentGrade` lock row — the code comment notes this last insert deliberately reuses the same lock table `submissions.services` already checks against, so a submit-in-flight and a grade-in-flight can't both succeed for the same pair.
- Grading writes an audit record with `action="grade.created"`.

### 5.1 What grading is *not* gated on

`grade_submission` checks ownership, latest-version and not-already-graded. It deliberately does **not** check `is_open(classroom)` or `is_expired(assignment)`:

- Teachers grade *after* the deadline — that is the normal case, not the exception. Gating on `due_at` would make an assignment ungradeable the moment it stops accepting work.
- Classes end while grading is still in progress. Gating on `ends_at` would strand every ungraded submission in a finished Class.

The asymmetry is the point: expiry freezes the **assignment** (title, description, `due_at`, rubric) and closes **submission**, but it opens nothing and closes nothing on the grading side. The only thing that stops grading is a grade already existing.

### 5.2 Grading is a one-way door, in three directions

One `grade_submission` call ends three things at once:

1. **That student's submissions** — `422 GRADED_MESSAGE` on any further upload, deadline notwithstanding ([04 §5.2](04-submissions.md#52-the-two-stops-and-only-these-two)).
2. **That student's grade** — no re-grade, no un-grade, no score correction. `grades` is unique on (assignment, student) and nothing in the API deletes or updates a row.
3. **The whole assignment's rubric** — the first grade in the class blocks `PUT /rubric` for every student ([03 §5](03-assignments-and-rubrics.md#5-key-functions--rules)), so criteria can't shift under scores already recorded against them.

Consequences, by design and both predictable support tickets:

- **A wrong score is permanent.** There is no admin override and no correction path. Stated here so it is a decision, not a discovery: the fix is a teacher who reads before clicking, and the warning line on the grade page ([§2.1](#21-teacher--grade-submission-teacherassignmentsidgradesubmissionid)).
- **A student who never submitted cannot be graded**, not even a 0 — grading takes a `submission_id` and there isn't one. Their gradebook cell never becomes a number: it reads `Chưa nộp` while the window is still open and `Đã đóng` once it closes ([06 §2.1](06-gradebook.md#21-teacher--gradebook-teacherclassesidgradebook)), and it stays `Đã đóng` permanently. Both say "no work handed in", neither says "scored zero" — different facts, and the gradebook should not conflate them.

## 6. Edge cases

- Teacher grades an older `submission_id` after the student uploaded a newer version in between → `422 NOT_LATEST_MESSAGE`; teacher must grade the current latest instead. The teacher never had a link to that older id ([04 §3](04-submissions.md#3-api)) — this happens because their page was stale, so the message tells them to reload.
- Teacher opens `/grade/{submissionId}` directly for a submission that is no longer the latest → the page loads (the id resolves for its owning teacher only while it is latest, otherwise `404`), and the `422` is the backstop.
- Grading after `due_at` has passed, or after the Class's `ends_at` → **allowed**, `200`. See [§5.1](#51-what-grading-is-not-gated-on).
- Editing the rubric between two students' grades → `422 ALREADY_GRADED_MESSAGE`; the first grade in the class closed it for all of them.
- Student unenrolled after submitting, then teacher tries to grade → the row is already gone from the teacher's list ([04 §2.2](04-submissions.md#22-teacher--assignment-submissions-teacherassignmentsid)) and a direct call `404`s on the ownership re-fetch. Their old `Submission` rows stay for audit.
- Student's account disabled between submitting and grading → grades normally; `is_active` is a login flag, not a grading one.
- Two teachers (shouldn't happen given single-teacher-per-Class ownership, but defensively) racing to grade the same submission → the `AssignmentGrade` unique constraint plus the pre-check make the second write `422`.
- Student requests `/my-result` before any grade exists → `404`, not an empty/zero result. The frontend never calls it outside `learning_state == GRADED`.
- Assignment has no rubric but the request sends `scores[]` (or the reverse) → `422` from `GradeInputSerializer`; the shape of the body has to match the assignment, and the frontend picks the form from the same fact.
