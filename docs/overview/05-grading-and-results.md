# Feature: Grading & Results

Part of [00-system-overview](00-system-overview.md). Backend app: `grading/`. Frontend: `GradePage`, `ResultPage`.

## 1. Purpose

One-time grading of a student's latest submission — by rubric (server sums criterion scores) or by manual total when the assignment has no rubric. Grading is final: it locks the (assignment, student) pair against further submissions and further grading.

## 2. Screens (ASCII)

### 2.1 Teacher — Grade submission (`/teacher/assignments/{id}/grade/{submissionId}`)

```
Rubric case:
+------------------------------------------------------------+
| Grade submission                                             |
|                                                                |
| Correctness (40)   Score [___]                                |
| Code quality (30)  Score [___]                                |
| Documentation (30) Score [___]                                |
| Feedback [_____________________________]                     |
| Total: 82 / 100  (server-calculated)                          |
| [ Chấm điểm ]                                                  |
+------------------------------------------------------------+

No-rubric case:
+------------------------------------------------------------+
| Grade submission                                             |
| Total score (0-100) [___]                                     |
| Feedback [_____________________________]                      |
| [ Chấm điểm ]                                                  |
+------------------------------------------------------------+
```

### 2.2 Student — My result (`/student/assignments/{id}/result`)

```
+------------------------------------------------------------+
| My result                                                     |
| Total score: 82 / 100                                         |
|                                                                |
| Correctness    32 / 40                                        |
| Code quality   26 / 30                                        |
| Documentation  24 / 30                                        |
|                                                                |
| Feedback: "Good structure, add tests next time."               |
+------------------------------------------------------------+
```

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| PUT | `/api/submissions/{submission_id}/grade` | Owning Teacher | Body: `total_score` (no rubric) or `scores: [{criterion_id, score}]` (rubric) + `feedback`. `422` if not latest version or already graded |
| GET | `/api/assignments/{id}/my-result` | Owning Student | Returns the `Grade` + `CriterionScore` rows, `404` until graded |

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

## 6. Edge cases

- Teacher grades an older `submission_id` after the student uploaded a newer version in between → `422 NOT_LATEST_MESSAGE`; teacher must grade the current latest instead.
- Two teachers (shouldn't happen given single-teacher-per-Class ownership, but defensively) racing to grade the same submission → the `AssignmentGrade` unique constraint plus the pre-check make the second write `422`.
- Student requests `/my-result` before any grade exists → `404`, not an empty/zero result.
