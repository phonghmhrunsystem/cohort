# Class Management System — Design

## Goal

Build a local web application for teachers and students to manage classes, assignments, submissions, rubric-based grading, and access control. The product must demonstrate a complete teacher-to-student workflow by 29 July 2026.

## Scope

### MVP

- Login and role-based access for `TEACHER` and `STUDENT`.
- Teachers create classes, enroll students, create assignments and rubrics, view submissions, and grade them.
- Students view their classes and assignments, submit one file before the deadline, and view rubric scores and feedback.
- Role-focused dashboard: teacher sees pending grading; student sees upcoming work and recently graded submissions.
- Server-side authorization, deadline enforcement, file validation, and automated tests.

### Deferred / bonus

- CSV grade export for a teacher's class, only after the MVP and its test suite pass.

### Explicitly excluded

- Chat, realtime notifications, online deployment, automatic AI grading, and microservices.

## Architecture

```text
React + Vite + TypeScript + Tailwind CSS (localhost:5173)
                | REST API with JWT
Django + Django REST Framework + SimpleJWT (localhost:8000)
                | SQLite database and local media/ uploads
```

The backend is the authorization and validation boundary. The frontend may hide unavailable actions, but it must never be relied upon to enforce role, ownership, deadline, file type, file size, or grades.

## Domain model

```text
User(role: TEACHER | STUDENT)
Classroom(teacher)
Enrollment(classroom, student)
Assignment(classroom, title, description, due_at, max_score)
RubricCriterion(assignment, title, max_score)
Submission(assignment, student, file, note, submitted_at)
Grade(submission, teacher, feedback, total_score)
CriterionScore(grade, criterion, score, feedback)
```

Constraints:

- `Enrollment(classroom, student)` is unique.
- `Submission(assignment, student)` is unique.
- The sum of criterion maximum scores equals the assignment maximum score.
- A submission must belong to an enrolled student and be created no later than `due_at`.
- A teacher may only manage classrooms and descendants that they own.
- A student may only read their own submissions and grades.
- `Grade.total_score` is calculated on the server from criterion scores; clients never supply it.

## API surface

| Area | Endpoints |
|---|---|
| Identity | `POST /auth/login`, `GET /auth/me` |
| Classes | `GET/POST /classes`, `GET/PATCH/DELETE /classes/{id}`, `POST /classes/{id}/students` |
| Assignments | `GET/POST /assignments`, `GET/PATCH/DELETE /assignments/{id}`, `PUT /assignments/{id}/rubric` |
| Submissions | `POST /assignments/{id}/submit`, `GET /assignments/{id}/submissions`, `GET /submissions/{id}` |
| Grades | `PUT /submissions/{id}/grade` |

All endpoints require JWT except login. List/detail queries are filtered by the authenticated user's role and ownership.

## UI

- Login page.
- Role-focused dashboard.
- Class list and class detail with Assignments and Members tabs.
- Assignment detail showing description, deadline, rubric, and submit form for students; submission list for teachers.
- Grading page with one score and feedback input per criterion, plus automatically displayed total.
- Result page showing the rubric breakdown and teacher feedback.

Use one sidebar, breadcrumbs, loading states, empty states, deadline badges, contextual API errors, keyboard focus states, labels for inputs, and non-color-only status cues.

## Validation and failure behavior

- Reject unsupported file types and oversized files before storage; show a readable field error.
- Reject late submissions with the deadline in the message.
- Return `403` for an authenticated user without access and `404` for missing resources.
- Keep score validation and total calculation in the backend; reject scores outside their criterion range.

## Test strategy

| Layer | Tool | Minimum evidence |
|---|---|---|
| Unit | Django `TestCase` | 6–10 tests for deadline, ownership, enrollment, and score rules |
| API | DRF `APIClient` | 10–15 tests for auth, RBAC, upload, submit, and grading endpoints |
| E2E | Playwright | teacher creates assignment → student submits → teacher grades → student reads result; plus a denied-role path |

Key assertions cover cross-student data access, cross-teacher ownership, deadline enforcement, file validation, rubric score limits, and calculated totals.

## Delivery schedule

| Date | Deliverable |
|---|---|
| 24/07 | Scaffold, API contract, data model, authentication and RBAC |
| 25/07 | Classes, enrollment, assignments, rubrics, unit/API tests |
| 26/07 | Submission upload and grading, API tests |
| 27/07 | React UI and Playwright happy path |
| 28/07 | Bug fixing, UX/accessibility, optional CSV export |
| 29/07 | Verification, README, demo accounts, screenshots/video |

## AI and Superpowers workflow evidence

1. Brainstorm requirements and approve this design.
2. Convert the design into an ordered implementation plan with acceptance criteria.
3. Implement small vertical slices using test-first checks for business rules and APIs.
4. Use AI for focused code review and test-case suggestions; verify every result through local tests and browser flow.
5. Record commands, test output, design decisions, and demo evidence in the README or development log.

## Acceptance criteria

1. A teacher can create a class, enroll a student, set an assignment and rubric, then grade that student's file submission.
2. The enrolled student can see only their classes, submit before the deadline, and later see their own detailed grade.
3. Role and ownership violations, invalid uploads, late submissions, and invalid rubric scores are rejected server-side.
4. Unit, API, and E2E tests cover the primary workflow and an authorization failure.
5. The repository includes local setup instructions and demo credentials.
