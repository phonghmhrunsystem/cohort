# Product Redesign Design

## Purpose

Replace the earlier phase roadmap with feature-based implementation plans. The redesign fixes session loss, missing logout and route protection, unstable responsive layouts, and incomplete Teacher/Student administration. It preserves the local-only class-management scope: Django, SQLite, local file storage, React, and no new dependency.

## Roles and route map

| Role | Allowed routes | Home after login |
|---|---|---|
| `ADMIN` (Master) | `/admin/users`, `/admin/audit-logs` | `/admin/users` |
| `TEACHER` | `/teacher/cohorts`, `/teacher/cohorts/:id?tab=students|assignments`, `/teacher/assignments/:id/submissions` | `/teacher/cohorts` |
| `STUDENT` | `/student/cohorts`, `/student/cohorts/:id` | `/student/cohorts` |

`/login` is the only public route. Any unknown route, missing session, or role-incompatible route redirects to `/login`. Every authenticated page uses a desktop sidebar and a horizontally scrollable mobile navigation bar; Logout is the final navigation action.

## Visual design decisions

- The Admin application shell uses a persistent desktop sidebar and horizontal navigation on mobile.
- Account creation and editing use a modal above the filtered account list.
- Teacher cohort lists use cards, not tables; cohort detail uses `students` and `assignments` tabs on the same route, represented in the query string.
- Student assignments use status cards, not a separate dashboard.
- Teacher grading uses one page: submission details on the left and grading form on the right. File download is a primary button; Student navigation is a compact previous/next icon-button pair with visible position.

## Authentication and session

1. `POST /auth/login` accepts `{email, password}` and returns `{access_token, user}` for an active account only.
2. The frontend stores the access token in `sessionStorage`; it survives refresh and URL changes but is removed when the browser session closes.
3. The backend uses a startup-generated JWT signing secret. A backend restart invalidates every existing token. The next authenticated `GET /auth/me` returns `401`; the frontend clears `sessionStorage` and redirects to `/login`.
4. `POST /auth/logout` accepts the bearer token and returns `204`. The frontend always clears its session and redirects to `/login`, including if that API request fails.
5. API client handling for every `401` is centralized: clear the session once, then navigate to `/login`.

## Account administration

Master/Admin manages only active `TEACHER` and `STUDENT` accounts. There is no UI or permitted Admin API operation to create, list, edit, reset, deactivate, or otherwise manage an `ADMIN` account.

### Account list UI

- Page title, role filter (`All`, `Teacher`, `Student`), and a search input for full name or email.
- Search is debounced by 300 ms.
- The default and only displayed population is `is_active=true`; inactive records are never displayed in the UI.
- Each row/card offers Edit and Deactivate. Deactivate requires confirmation and immediately removes the row from the rendered list after success.
- Create and Edit use the same modal. The edit modal renders email and role as read-only text and shows a blank optional New Password field.

### Account model fields and validation

| Field | Create | Edit | Validation |
|---|---:|---:|---|
| Full name | required | required | Trimmed, 2–100 characters |
| Email | required | immutable | Lowercase valid email, unique |
| Role | required | immutable | `TEACHER` or `STUDENT` only |
| Password | required | optional reset | 8–128 characters |
| Phone | optional | optional | 9–15 digits, optional leading `+` |
| Date of birth | optional | optional | Valid date strictly before today |
| Gender | optional | optional | `NAM`, `NU`, or `KHAC` |
| Address | optional | optional | Trimmed, at most 255 characters |

### Account API

| Endpoint | Request | Result / rule |
|---|---|---|
| `GET /users?q=&role=` | optional query and role | Active Teacher/Student only; Admin-only |
| `POST /users` | profile fields, password, role | Creates Teacher/Student only; `201` |
| `PATCH /users/{id}` | mutable profile fields and optional `new_password` | Email and role rejected; target must be active Teacher/Student |
| `DELETE /users/{id}` | none | Sets `is_active=false`; `204`; never hard-deletes |

Every successful create, edit, password reset, or deactivation creates an immutable audit record without passwords.

## Teacher cohort management

### Cohorts UI

- `/teacher/cohorts` renders cards for cohorts owned by the current Teacher, a name search field, and a Create Cohort button.
- Create/Edit Cohort uses a modal.
- `/teacher/cohorts/:id?tab=students` renders the enrolled-student tab; `/teacher/cohorts/:id?tab=assignments` renders assignments. If tab is omitted, use `students`.
- The Student tab has name/email search, Add Student, and enrolled Student list.
- The Assignment tab has assignment cards and Create Assignment.
- Cohorts and assignments do not have delete actions in this roadmap, preventing accidental loss of learning records. They can be edited by their owner.

### Cohort and enrollment validation/API

| Item | Validation |
|---|---|
| Cohort name | Required, trimmed, 2–100 characters |
| Cohort description | Optional, at most 1,000 characters |
| Enrollment | Account must be an active Student and not already enrolled |

| Endpoint | Access |
|---|---|
| `GET/POST /cohorts?q=` | Current Teacher; list only owned cohorts |
| `GET/PATCH /cohorts/{id}` | Owning Teacher |
| `GET /cohorts/{id}/students?q=` | Owning Teacher |
| `POST /cohorts/{id}/enrollments` with `{student_id}` | Owning Teacher; duplicate/ineligible input is `422` |

## Assignments and rubrics

Assignment creation/edit is modal-based inside the assignment tab.

| Field | Validation |
|---|---|
| Title | Required, trimmed, 2–150 characters |
| Description | Required, trimmed, 10–5,000 characters |
| Due date/time | Required and future at creation |
| Maximum score | Fixed at 100; no editable UI control |
| Rubric criterion title | Trimmed, 2–150 characters |
| Rubric criterion maximum | Integer 1–100; rubric sum must equal 100 |

| Endpoint | Access |
|---|---|
| `GET/POST /cohorts/{id}/assignments` | Owning Teacher |
| `GET/PATCH /assignments/{id}` | Owning Teacher |
| `PUT /assignments/{id}/rubric` | Owning Teacher; validates sum at 100 |

## Student work and results

### Student UI

- `/student/cohorts` shows cards for enrolled cohorts only.
- `/student/cohorts/:id` shows assignment cards with one of four states: Open, Submitted, Graded, or Closed.
- Open cards have Submit. Submitted cards have View History. Graded cards show the score and View Result. Closed cards expose no submission action.
- Submit opens a modal with a required file chooser, optional note, selected filename and size, and a disabled button while uploading.
- History exposes every own version. Result exposes total, feedback, and criterion scores where a rubric exists.

### Submission API and validation

| Endpoint | Access |
|---|---|
| `POST /assignments/{id}/submissions` multipart: `file`, optional `note` | Enrolled Student |
| `GET /assignments/{id}/my-submissions` | Enrolled Student |
| `GET /assignments/{id}/my-result` | Enrolled Student |

Accepted files: DOC, DOCX, PDF, MP4, MOV. The server validates extension, MIME type, and a maximum of 1 GB before storage. Note is at most 1,000 characters. The server returns `422` for missing enrollment, closed deadline, or an assignment that has already been graded; accepted repeat submissions produce increasing versions. File download always passes an authorization endpoint and storage paths are never public.

## Teacher grading

- `/teacher/assignments/:id/submissions` lists only the latest version per Student for an assignment the Teacher owns.
- Selecting a Student renders file details, a primary Download Submission File button, previous/next icon buttons with tooltips and screen-reader labels, and a `current / total` indicator.
- A non-rubric assignment shows an integer score from 0 through 100 and feedback up to 5,000 characters.
- A rubric assignment shows each criterion score from 0 through its maximum and optional criterion feedback. The server calculates the total.
- Save Grade locks further submission for that Student and records an audit event.

| Endpoint | Access |
|---|---|
| `GET /assignments/{id}/submissions` | Owning Teacher |
| `PUT /submissions/{id}/grade` | Owning Teacher; validates score/rubric data |
| `GET /submissions/{id}` | Owning Teacher or owning Student |

## Cross-cutting rules

- Backend is the authority for authentication, role, ownership, active-status, enrollment, deadline, score, file, and rubric rules. UI validation improves feedback but does not replace server validation.
- Return `401` for unauthenticated, `403` for unauthorized, `404` for unavailable resources, and `422` for business-rule violations.
- All mutation paths create append-only audit records with no password or raw file content.
- Layout must remain usable at 320px and desktop widths: page content does not overflow horizontally; the only permitted horizontal scrolling is data tables where every column is needed.
- No new frontend or backend dependency is introduced.

## Delivery order

1. Auth/session/route guard/shared responsive shell.
2. Account profile schema and Master Teacher/Student administration.
3. Teacher cohorts, enrollment, and assignment/rubric management.
4. Student submission/history/result and Teacher grading.
5. Demo data, end-to-end acceptance flows, and responsive QA.
