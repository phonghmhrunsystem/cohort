# Class Management MVP Demo — Validated Design

## Outcome

Deliver a local-only, demonstrable class-management application. The complete demo is:

`Admin creates Teacher and Student -> Teacher creates cohort and assignment -> Student submits PDF/DOCX twice -> Teacher grades latest version -> Student views result`.

The application uses React + Vite + TypeScript, Django REST Framework, SQLite, JWT, and private local file storage. It is a modular monolith; no cloud service, microservice, notification, chat, self-registration, AI grading, or video upload is part of this MVP.

## Confirmed product decisions

| Topic | Decision |
| --- | --- |
| Demo files | PDF and DOCX only. |
| Time | Deadline input and display use `Asia/Ho_Chi_Minh` (UTC+7); timestamps are stored in UTC. |
| Accounts | An Admin creates Teacher and Student accounts in the UI with an initial password, role, and active state. |
| Audit | Important changes are appended atomically to immutable audit records. Only Admin has an audit-log UI. |
| Rubric | Optional, must total 100, and is immutable after assignment creation. |
| Deadline | Teacher may move it only to a future UTC+7 time; every change is audited. |
| Grade target | Teacher can grade only the latest submission for a student and assignment. |
| Feedback | Required for both rubric and manual grades. |

## Roles and server policy

| Role | Allowed actions |
| --- | --- |
| `ADMIN` | Login; create, edit, activate/deactivate accounts; read all audit logs. |
| `TEACHER` | Manage only owned cohorts, enroll existing Students, create assignments/rubrics, inspect latest submissions, grade. |
| `STUDENT` | Read only enrolled cohorts/assignments, submit own work before deadline, view own history and results. |

The server scopes all list queries and re-checks the relationship on every detail, file download, mutation, and grade request. The UI may hide unavailable actions but never supplies authorization.

## Core business rules

- Email is unique; passwords use Django hashes; inactive accounts cannot log in.
- Enrollment is unique per `(cohort, student)` and accepts `STUDENT` accounts only.
- Assignment maximum score is always 100. A rubric has one or more criteria whose maxima total exactly 100.
- A submission is valid only for an enrolled student, before its deadline, and while no grade exists for that student's assignment.
- Each valid upload creates an immutable incrementing version. The teacher list returns the greatest version per student; student history returns every own version.
- Validate extension, MIME type, and configured size limit before storing a PDF or DOCX. Files are private and downloadable only through an authorization-checked endpoint.
- Rubric grading requires exactly one score per criterion within its maximum; the server calculates the total. Manual grading is allowed only without a rubric and accepts `0..100`.
- A successful grade locks further submission versions for that student/assignment.
- Audit metadata is allow-listed: it excludes passwords, password hashes, tokens, file bytes, and absolute storage paths.

## Delivery slices

### Phase 1 — Identity and Admin

Build login, current-user lookup, role routing, Admin user list/create/edit/activate controls, and read-only Admin audit log. Seed data is not needed: the demo starts by creating accounts in the UI.

**Demo proof:** Admin creates Teacher and Student; deactivates an account; the inactive account cannot log in; both actions appear in audit history.

### Phase 2 — Cohort and enrollment

Build Teacher cohort list/detail/create/edit, enrollment of existing Student accounts, Student cohort list, and server-side ownership/enrollment denial.

**Demo proof:** Teacher creates a cohort and enrolls one Student. That Student sees it; a different Student does not.

### Phase 3 — Assignment and rubric

Build assignment creation/detail, UTC+7 deadline input/display, optional rubric creation, rubric-total validation, immutable-rubric policy, and future-only deadline changes.

**Demo proof:** Teacher creates a rubric assignment; the enrolled Student sees title, description, deadline, and rubric.

### Phase 4 — Versioned submission

Build student upload/history, teacher latest-submission list, private download, validation-before-storage, and failed-write cleanup.

**Demo proof:** Student uploads two valid PDFs/DOCX files. History shows versions 1 and 2; Teacher sees only version 2. Invalid, late, un-enrolled, and already-graded attempts store no file.

### Phase 5 — Grade and result

Build teacher grading form, rubric score calculation or manual total, required feedback, latest-submission guard, Student result view, and grade lock.

**Demo proof:** Teacher grades version 2; Student sees total, feedback, and rubric breakdown; a new upload is rejected.

### Phase 6 — Demo hardening

Finish role dashboards, readable field/action errors, loading and empty states, audit visibility, API tests for every business rule, and one Playwright journey spanning the complete demo.

## Verification gates

Each phase must leave behind its smallest useful proof: API tests for validation/authorization and a browser check for its newly visible workflow. Before handoff, run:

1. Django tests for account status, role/ownership, enrollment, deadline, upload rejection before storage, version/latest selection, rubric totals, manual/rubric grades, and audit writes.
2. Playwright: Admin creates accounts -> Teacher creates cohort/enrollment/assignment -> Student uploads twice -> Teacher grades version 2 -> Student sees result.
3. One browser/API denied-access check for a Student reading another student's result or a Teacher accessing another Teacher's cohort.

## Out of scope until after demo

Video uploads, generic file types, assignment drafts/publishing, rubric editing, deadline extensions to past/current time, CSV export, notifications, and deployment are deliberately deferred. Add each only with a new requirement and corresponding acceptance test.
