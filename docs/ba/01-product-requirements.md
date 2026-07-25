# Class Management for Internal AI Training — Product Requirements

## Goal

Build a local-only application for an internal AI-training cohort. It lets administrators manage accounts, teachers run cohorts and assignments, and students submit work and receive feedback.

## Scope

### Included

- Login with administrator-created accounts.
- Role-based access for `ADMIN`, `TEACHER`, and `STUDENT`.
- Cohort, enrollment, assignment, optional rubric, submission, grading, and audit tracking.
- DOC/DOCX, PDF, and video uploads up to 1 GB per submission.
- Local execution, SQLite, and local file storage only.

### Excluded

- Self-registration, notifications, chat, AI grading, online deployment, cloud storage, and microservices.

## Roles

| Role | Permissions |
|---|---|
| `ADMIN` | Create, update, activate/deactivate accounts and view audit logs. Does not manage learning content. |
| `TEACHER` | Manage only owned cohorts, their enrollments, assignments, rubrics, latest submissions, and grades. |
| `STUDENT` | View only enrolled cohorts and own assignments, submissions, and results. |

## Functional requirements

1. An administrator creates accounts with an email, initial password, role, and active status.
2. A teacher creates a cohort and enrolls existing student accounts.
3. A teacher creates an assignment with title, description, deadline, and a maximum score of 100.
4. A teacher may define a rubric. Its criterion maximum scores must total 100.
5. An enrolled student may submit a supported file repeatedly before the deadline. Each submission becomes a new version; previous versions remain visible to that student.
6. A teacher sees only the latest version for each student on the assignment submission list.
7. A teacher grades either by rubric (server-calculated total) or, when no rubric exists, by a total score from 0 through 100 plus feedback.
8. After grading, the student can no longer submit another version, even before the deadline.
9. After the deadline, submission is closed for every student. Late submission is not supported.
10. Important actions create immutable audit records.

## Business rules

- Email is unique. Passwords are stored only as hashes.
- Enrollment is required to view or submit work in a cohort.
- Assignment ownership derives from its cohort's teacher.
- Upload validation runs before the file is stored: allowed type, MIME type, and size no greater than 1 GB.
- The backend, never the UI, enforces role, ownership, enrollment, deadline, score, and file rules.
- Audit metadata must not contain passwords or raw file content.
