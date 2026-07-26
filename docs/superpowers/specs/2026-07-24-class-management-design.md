# Class Management System — Approved Design

## Goal

Build a local-only application for an internal AI-training cohort. Administrators manage accounts, teachers manage their owned cohorts and assessments, and students submit work and receive feedback. The MVP demonstrates the complete flow by 29 July 2026.

## Scope

### Included

- Login with administrator-created accounts and JWT authentication.
- Roles: `ADMIN`, `TEACHER`, and `STUDENT`.
- Cohorts, enrollment, assignments, optional rubrics, versioned file submissions, grading, and immutable audit records.
- DOC/DOCX, PDF, and video uploads up to 1 GB, stored locally.
- React + Vite + TypeScript UI and Django REST API with SQLite.

### Excluded

- Self-registration, chat, notifications, AI grading, online deployment, cloud storage, microservices, and CSV export.

CSV export remains a post-MVP option only after the acceptance suite passes.

## Architecture

```text
React + Vite + TypeScript + Tailwind CSS (localhost:5173)
                | REST API + JWT / multipart upload
Django + Django REST Framework + SimpleJWT (localhost:8000)
                | Django ORM + transactions
SQLite                         private local media directory
```

This is a modular monolith. Django is the authorization and validation boundary; the frontend may hide unavailable actions but never enforces permissions, ownership, deadlines, file constraints, or scores.

### Backend modules

```text
config/        settings, URLs, JWT and media configuration
accounts/      User model, authentication, administrator account management
audit/         append-only audit model, audit writer, read policy
cohorts/       Cohort, enrollment, ownership and enrollment policy
assignments/   Assignment and rubric criteria
submissions/   versioned uploads, protected download, latest-submission query
grading/       grades, criterion scores, server-side total calculation
```

No repository abstraction, event bus, service container, or microservice is required. Domain services are limited to operations that must validate several models and write atomically: changing a rubric, creating a submission version, and grading.

## Roles and access policy

| Role | Can do | Cannot do |
|---|---|---|
| `ADMIN` | Create, edit, activate, and deactivate accounts; read all audit records | Manage learning content or enrollments |
| `TEACHER` | Manage owned cohorts, enroll students, manage descendant assignments/rubrics, view latest submissions, grade them | Read or mutate another teacher's cohort or student result outside an owned cohort |
| `STUDENT` | Read enrolled cohorts and assignments, submit before the deadline, read own history and results | Read another student's files/results or un-enrolled cohorts |

List queries must be scoped in the backend, not filtered after serialization. Detail, download, update, and grade operations must re-check role and the target object's relationship to the actor.

## Domain model and constraints

```text
User(email, password_hash, role, is_active)
Cohort(teacher)
Enrollment(cohort, student)
Assignment(cohort, title, description, due_at, max_score=100)
RubricCriterion(assignment, title, max_score)
Submission(assignment, student, version, file metadata, note, submitted_at)
Grade(submission, teacher, total_score, feedback, graded_at)
CriterionScore(grade, criterion, score, feedback)
AuditLog(actor, action, target_type, target_id, metadata, created_at)
```

- `User.email` is unique; passwords are only Django hashes.
- `Enrollment(cohort, student)` is unique and `student` must have role `STUDENT`.
- `Submission(assignment, student, version)` is unique. A resubmission creates `max(version) + 1`; no submission row is overwritten.
- A rubric is optional. When it exists, criterion maxima total exactly 100.
- A submission requires active enrollment, `now <= due_at`, and no existing grade for that student on the assignment.
- A teacher may grade only the latest submission of a student in an owned cohort.
- A rubric grade contains exactly one score per criterion, each between zero and its criterion maximum. `Grade.total_score` is server-calculated.
- A rubric cannot change after any assignment submission has been graded.
- Audit rows are append-only. Metadata is allow-listed and excludes password values/hashes, JWTs, raw uploaded content, and absolute storage paths.

## API contract

All endpoints except login require a JWT Bearer token. Return `401` for missing/invalid authentication, `403` for an authenticated but unauthorized actor, `404` for an absent resource, and `422` for a business-rule violation.

| Area | Endpoints | Access |
|---|---|---|
| Identity | `POST /auth/login`, `GET /auth/me` | Public / authenticated |
| Accounts | `GET/POST /users`, `PATCH /users/{id}` | Admin |
| Audit | `GET /audit-logs` | Admin all; teacher events for owned cohorts only |
| Cohorts | `GET/POST /cohorts`, `GET/PATCH /cohorts/{id}`, `POST /cohorts/{id}/enrollments` | Owning teacher; student read scope by enrollment |
| Assignments | `GET/POST /cohorts/{id}/assignments`, `GET/PATCH /assignments/{id}`, `PUT /assignments/{id}/rubric` | Owning teacher; enrolled student read scope |
| Submissions | `POST /assignments/{id}/submissions`, `GET /assignments/{id}/submissions`, `GET /assignments/{id}/my-submissions`, `GET /submissions/{id}` | Enrolled student submit/history; owner teacher latest list; owner student or teacher detail |
| Files | `GET /submissions/{id}/download` | Owner student or owner teacher |
| Grades | `PUT /submissions/{id}/grade`, `GET /assignments/{id}/my-result` | Owning teacher grade; owner student result |

Upload uses `multipart/form-data`. The server validates extension, MIME type, and size before storage. File paths are never public URLs.

## Domain operations

### Submission version

The submission service validates enrollment, deadline, and graded state before writing a file. It computes the next version under a database transaction, writes server-generated storage metadata, then appends the audit record. If the database operation fails after storage succeeds, it removes the just-created file.

The teacher submission list returns only the greatest version per student. Student history returns every version belonging to that authenticated student.

### Grading

Grading runs in one transaction. The service confirms that the teacher owns the assignment's cohort and that the target is the student's latest submission. With a rubric it validates every criterion score and calculates the total; without a rubric it validates a manual total from 0 to 100. It writes the grade and criterion scores, then appends an audit record. Any grade locks future submissions for that student and assignment.

### Audit

Every account administration action, cohort/enrollment change, assignment/rubric change, submission, and grade writes an audit row in the same transaction as the domain change. No endpoint creates, edits, or deletes audit rows.

## UI

- Login: email, password, readable authentication error.
- Admin: account list/create/edit/activate state and read-only audit log.
- Teacher dashboard: owned cohorts, deadlines, and submissions awaiting grades.
- Cohort detail: cohort data, enrolled students, assignments.
- Assignment detail: description, deadline, rubric, latest submissions for teacher; submit/history for student.
- Grading: criterion score inputs or manual score, feedback, displayed calculated total.
- Student dashboard and result: enrolled cohorts, open assignments, own grades, feedback, and rubric breakdown.

Use a shared sidebar, breadcrumbs, labelled inputs, keyboard focus states, loading/empty states, deadline badges, and contextual API errors. Frontend totals are display-only and must match server responses.

## Phased delivery

### Phase 0 — Contract and foundations

Lock dependencies, `/api` URL prefix, UTC timestamps, error shape, supported MIME allow-list, and upload-size configuration. Trace each use case to an endpoint and policy before implementation.

### Phase 1 — Identity and administrator controls

Create the custom user model before first migration; implement JWT, `/auth/me`, admin account management, inactive-login rejection, and account audit rows.

### Phase 2 — Cohorts and enrollment

Implement cohort ownership, enrollment uniqueness/role validation, scoped queries, and audit rows. Prove cross-teacher and un-enrolled access is denied.

### Phase 3 — Assignments and rubrics

Implement assignment ownership, deadline/max-score validation, atomic rubric replacement, 100-point validation, rubric-change lock after grades, and audit rows.

### Phase 4 — Versioned private submissions

Implement protected uploads/downloads, validation before storage, append-only versions, latest-per-student query, cleanup on failed persistence, and submission audit rows.

### Phase 5 — Grading and results

Implement atomic rubric/manual grading, server totals, latest-submission restriction, grade-lock behavior, result reads, and grading audit rows.

### Phase 6 — Role-focused frontend

Build vertical slices in workflow order: auth/admin, teacher cohort/assignment, student upload/history, teacher grade, student result. Use API errors as the source of business-rule feedback.

### Phase 7 — Verification and handoff

Complete API/unit coverage, Playwright workflow evidence, README setup/demo credentials, and UAT evidence.

## Test and acceptance strategy

| Layer | Tool | Required evidence |
|---|---|---|
| Domain/API | Django `TestCase` and DRF `APIClient` | Auth/role, ownership, enrollment, deadline, validation-before-storage, versioning/latest query, rubric/manual grading, audit writing |
| Browser | Playwright | Admin creates accounts → Teacher cohort/enrollment/assignment → Student uploads twice → Teacher sees version 2 and grades → Student sees result; plus denied access |

The acceptance suite must prove account activation behavior, role and ownership denial, invalid/late upload rejection without stored file, immutable submission history, correct score calculation, grade submission lock, protected result/file access, and immutable audit visibility.
