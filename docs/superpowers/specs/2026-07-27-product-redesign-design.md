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

## Screen design contract

This section is the implementation source of truth for the selected UI. Each implementation plan must name the affected screen IDs, its route, the state it changes, and the validation cases from this document. Do not introduce an alternate route, page form, table/card layout, or modal flow unless this spec changes first.

| ID | Route / role | Selected layout and purpose | Features and visible attributes |
|---|---|---|---|
| `LOGIN` | `/login` / public | Centered sign-in card on a plain responsive page. | Email and password fields; Sign in button; loading state; inline API error; authenticated users redirect to their role home. |
| `ADMIN-USERS` | `/admin/users` / Admin | Shared application shell; desktop sidebar, mobile horizontally scrollable nav; page header, filters, results list, and a native dialog modal above the list. | Title/subtitle; `All`/`Teacher`/`Student` role filter; name/email search; Create button; active-account rows/cards with full name, email, role badge, Edit, and Deactivate; empty state; confirmation before deactivation. |
| `ADMIN-AUDIT` | `/admin/audit-logs` / Admin | Same shell; responsive audit table, its only permitted horizontal-scrolling region. | Timestamp, actor, event, target, and safe metadata; loading, empty, and request-error states; no password, token, raw file content, or private file path. |
| `TEACHER-COHORTS` | `/teacher/cohorts` / Teacher | Shared shell; searchable grid of cohort cards, never a table. | Search field; Create Cohort button; each card has name, description summary, enrolled-student count, assignment count, Edit, and Open Cohort; loading, empty, and request-error states. |
| `TEACHER-COHORT-DETAIL` | `/teacher/cohorts/:id?tab=students|assignments` / owning Teacher | Same route with native tab buttons; default tab is `students`; create/edit forms and student enrollment use native dialog modals. | Header and Edit Cohort action; Students tab has search, Add Student, active enrolled-student list; Assignments tab has assignment cards and Create Assignment; invalid/missing tab normalizes to `students`; ownership/not-found error is not rendered as another Teacher's data. |
| `STUDENT-COHORTS` | `/student/cohorts` / Student | Shared shell; enrolled-cohort cards only. | Cohort name, description summary, assignment count, and Open Cohort; loading, empty, and request-error states. |
| `STUDENT-ASSIGNMENTS` | `/student/cohorts/:id` / enrolled Student | Cohort header followed by assignment status cards; no separate dashboard. | Title, due date/time, score where available, and exactly one state/action: Open/Submit; Submitted/View History; Graded/score/View Result; Closed/no submission action. Submit, History, and Result use native dialogs. |
| `TEACHER-GRADING` | `/teacher/assignments/:id/submissions` / owning Teacher | One responsive page: selected submission detail left, grade form right; stacks vertically at narrow widths. | Student name; filename, size, submitted time, version; primary Download Submission File button; labelled previous/next icon buttons with tooltips; `current / total`; manual score/feedback or rubric criterion fields; Save Grade; empty-submission state. |

### Form and interaction contract

| UI element | Required behavior |
|---|---|
| Native dialogs | Create/edit account, create/edit cohort, enroll student, create/edit assignment/rubric, submit work, submission history, and result use accessible native `<dialog>` elements with visible title, Cancel, focus management, and Escape/overlay close unless an upload/save is pending. |
| Submit controls | Disable while their request is pending; prevent double submission; retain user-entered values after a `422`; surface the returned field or business-rule message near the relevant form control. |
| Search and filters | Account search is debounced 300 ms; cohort/student searches update the scoped list without changing the route. Empty results are distinct from loading and API errors. |
| Navigation | Sidebar is persistent on desktop. At narrow widths it becomes a horizontally scrollable navigation bar; Logout is its final action. All non-table page content fits 320 px without horizontal overflow. |
| Destructive action | Deactivate asks for confirmation and removes the account from the current list only after a successful response. There are no cohort or assignment delete controls. |

## Validation design contract

Frontend validation gives immediate feedback; the backend repeats every rule below and is authoritative. A `422` response keeps the form open, preserves safe input, and displays the server message. Authentication/authorization failures follow the route/session rules rather than exposing protected data.

| Surface | Client-side validation before request | Server-side validation and response |
|---|---|---|
| Login | Required email and password; valid email format. | Active account and password verification; invalid credentials return `401`. |
| Account create/edit modal | Trim strings; show required/length/format errors for editable fields; disable Save while pending. | Enforce the account field table below, unique lowercase email, immutable email/role on edit, and Teacher/Student-only target; field/business violation is `422`. |
| Cohort create/edit modal | Required trimmed name; description maximum. | Enforce name/description limits and Teacher ownership; invalid data is `422`, inaccessible resource is `403`/`404`. |
| Enrollment dialog | A Student selection is required; do not offer inactive/non-Student choices. | Require an active Student and unique enrollment; return `422` for duplicate/ineligible input. |
| Assignment/rubric modal | Required title/description/due date; numeric criterion maxima; show current rubric total and block Save unless it is 100. | Enforce trimmed limits, future deadline on creation, fixed maximum score, integer 1–100 criteria, and total exactly 100; return `422`. |
| Submission dialog | A file is required; show selected name and size; allow only DOC, DOCX, PDF, MP4, MOV; note maximum 1,000 characters. | Re-check extension, MIME, 1 GB limit, enrollment, deadline, and graded lock before storage; invalid input leaves no stored file and returns `422`. |
| Grade form | Manual score is integer 0–100; rubric fields accept only each criterion's range; feedback limit is shown; Save disabled while pending. | Re-check ownership/latest submission, manual/rubric shape, every criterion range, and server-calculated rubric total; invalid input returns `422`. |

### Required implementation evidence

Every plan that changes a screen must specify the files that implement the page/component, API client/types, style/responsive rules, backend serializer/service/view, and focused tests. Its acceptance steps must prove: valid submission, one representative client-side invalid case, matching `422` server rejection, loading/double-submit behavior where applicable, an empty/error state, and the role/ownership boundary for that screen.

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
