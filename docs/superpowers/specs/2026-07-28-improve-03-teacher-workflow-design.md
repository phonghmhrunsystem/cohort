# Feature 03 — Teacher Roster and Grading Workflow

## Goal

Give a Teacher an actionable roster and grade context without exposing data
from another Teacher's Class.

## Roster and progress

- Teacher Class > Students displays name, safe profile action, and assignment
  summary: `đã nộp / tổng bài`, `đã chấm / tổng bài`.
- Selecting a Student opens read-only profile data: full name, phone, date of
  birth, gender, address, and only Classes shared with the current Teacher.
- A Class/assignment summary response supplies server-calculated
  `enrolled_students`, `submitted_students`, and `graded_students`. UI never
  calculates a class-wide count from a paged or filtered roster.
- Per assignment, a Student status is exactly `CHUA_NOP`, `DA_NOP`, or
  `DA_CHAM`; the current latest submission decides `DA_NOP` and a grade decides
  `DA_CHAM`.

## Rubric and grading

- Each editable criterion has a `Xóa` control with confirmation.
- A rubric save requires at least one criterion, each score 1–100, and total
  exactly 100. Replacement remains atomic.
- Submission/grading views show student full name first, filename/submitted
  time second, and version only as supporting history information.

## Permission and acceptance

- Only the Teacher assigned to the Class can read its roster, progress, or
  Student detail; another Teacher receives no data.
- Teacher sees `0 / total` for a Student who has not submitted.
- Removing a criterion makes the total invalid until corrected; Save stays
  blocked client-side and server returns `422` for invalid direct requests.

## Out of scope

Teacher editing a Student profile, grade appeal workflow, grade history, and
cross-Class consolidated gradebook (Feature 06 provides a single-Class view).
