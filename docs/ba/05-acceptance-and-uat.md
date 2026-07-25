# Acceptance Criteria and UAT

## Acceptance criteria

1. Admin can create a Teacher and a Student account, then activate or deactivate either account.
2. A Teacher can create a cohort, enroll an existing Student, and create an assignment with a deadline and optional rubric.
3. An enrolled Student can submit DOC/DOCX, PDF, or video files no larger than 1 GB; each pre-deadline attempt appears in that Student's history.
4. A Teacher sees exactly the newest submission from each Student for an assignment.
5. The system rejects submission after the deadline and after the Student's assignment has been graded.
6. A Teacher can grade with rubric criteria totaling 100, or manually enter a 0–100 score when the assignment has no rubric.
7. The Student sees only their own result, including teacher feedback and rubric breakdown where applicable.
8. The backend rejects cross-role and cross-owner access, unsupported file types, oversized files, invalid scores, and unenrolled submissions.
9. Account changes, teaching-content changes, submissions, and grading appear in immutable audit logs.

## UAT scenarios

| ID | Scenario | Expected result |
|---|---|---|
| UAT-01 | Admin creates and deactivates an account. | Account exists; inactive account cannot log in; actions are audited. |
| UAT-02 | Teacher builds a cohort, enrolls a student, and publishes a rubric assignment. | Enrolled student sees the assignment; another student does not. |
| UAT-03 | Student uploads two valid files before deadline. | Both versions appear in history; teacher sees only version 2. |
| UAT-04 | Student attempts upload after deadline. | Request is rejected with a clear deadline error; no file is stored. |
| UAT-05 | Teacher grades latest submission. | Score is valid/calculated; student sees result; later upload is rejected. |
| UAT-06 | Student attempts another student's result; teacher attempts another teacher's cohort. | Server rejects both requests. |
| UAT-07 | User uploads an unsupported or oversized file. | Server rejects it before storage with a readable field error. |

## Test scope

- Django unit/API tests cover deadline, enrollment, ownership, account status, upload validation, rubric totals, grade totals, and audit writing.
- Playwright covers the happy path: Admin creates accounts -> Teacher creates assignment -> Student submits -> Teacher grades -> Student views result; plus one denied-access path.
