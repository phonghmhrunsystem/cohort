# Feature 02 — Account and Enrollment Management

## Goal

Let Admin manage people and class enrollment using readable lists and one
atomic save operation.

## Account list and edit

- `/admin/users` has three tab buttons: `Tất cả`, `Giáo viên`, `Học sinh`.
  They filter the existing active-account query; no duplicate route or screen.
- Full name is the primary line. Email remains a secondary identifier for
  disambiguation, not the list title. Numeric IDs never render.
- On edit, email and role are disabled/read-only. The password field is removed.
  Password recovery is Feature 05 only.
- Create retains email, role, and initial password; existing validation for
  unique normalized email and permitted Teacher/Student roles remains.

## Checkbox enrollment

- `/admin/classes/:id` opens one dialog containing searchable active Student
  checkboxes. Current enrollees are preselected.
- Admin saves the desired full set, not one Student at a time.
- `PUT /classes/{id}/enrollments` accepts `{ "student_ids": [1, 2] }` and
  returns the resulting active roster.
- The server validates every ID as an active Student, rejects duplicates, then
  atomically adds and removes enrollment. It rejects a removal after class end
  or when that Student has a submission in that Class; no partial change occurs.

## Acceptance

- Teacher and Student tabs return only their role and preserve search.
- A list with missing legacy names still has a safe visible fallback.
- A selected roster save with one invalid/removal-forbidden Student returns
  `422` and leaves all prior enrollment unchanged.
- A non-Admin cannot list candidates or replace enrollment.

## Out of scope

Bulk account import, hard deletion, account reactivation workflow, and changing
the immutable Class Teacher assignment.
