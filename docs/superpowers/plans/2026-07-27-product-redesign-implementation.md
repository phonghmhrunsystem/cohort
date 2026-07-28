# Product Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the specified local class-management redesign: durable browser-session auth, Admin-owned Classes, Teacher coursework, Student submissions, and Teacher grading.

**Architecture:** Keep Django/DRF as the sole authority for authentication, role, ownership, time-window, file, and grading rules. Rename the existing cohort API/domain to Classes rather than preserving two concepts; React uses one typed API layer, route guard, native dialogs, and a shared responsive shell.

**Tech Stack:** Django, Django REST Framework, SimpleJWT, SQLite, private local file storage, React, TypeScript, Vite, Vitest.

## Global Constraints

- No frontend or backend dependency may be added.
- Screens: `LOGIN` `/login`; `ADMIN-USERS` `/admin/users`; `ADMIN-AUDIT` `/admin/audit-logs`; `ADMIN-CLASSES` `/admin/classes`; `ADMIN-CLASS-DETAIL` `/admin/classes/:id`; `TEACHER-CLASSES` `/teacher/classes`; `TEACHER-CLASS-DETAIL` `/teacher/classes/:id?tab=students|assignments`; `STUDENT-CLASSES` `/student/classes`; `STUDENT-ASSIGNMENTS` `/student/classes/:id`; `TEACHER-GRADING` `/teacher/assignments/:id/submissions`.
- `/login` is public; unknown, missing-session, and role-incompatible routes clear session and redirect there.
- Store only `access_token` in `sessionStorage`; signing secret is generated at backend startup, so a restart invalidates all tokens.
- Return `401` unauthenticated, `403` unauthorized, `404` unavailable, and `422` validation/business-rule failure.
- Every mutation writes an append-only audit event with no password, token, raw file content, or private storage path.
- All non-table content fits 320 px without horizontal overflow. The audit table is the only horizontally scrollable data region.
- Use accessible native `<dialog>` elements for every modal flow. Pending submit/save/upload blocks Escape/overlay close and duplicate requests; a `422` keeps safe form input and shows its field/business message.

---

## File Structure

| Area | Files and responsibility |
| --- | --- |
| Identity | `backend/accounts/{models,serializers,views,urls}.py`, migration `0003_user_profile.py`; `frontend/src/{api,auth,session,AppShell}.tsx` and `main.tsx` own token lifecycle and routing. |
| Classes | Rename `backend/cohorts` to `backend/classes` (model `Class`, `Enrollment`, serializers/services/views/urls/tests), register it in `config`; replace `frontend/src/cohorts.ts` and Cohort pages with `classes.ts` and role-specific Class pages. |
| Coursework | New `backend/assignments` app for Assignment/RubricCriterion and its tests; `frontend/src/assignments.ts` plus Teacher Class Detail UI. |
| Student work | New `backend/submissions` app for private files, versions, grades and criterion scores; `frontend/src/submissions.ts`, Student Assignment and Teacher Grading pages. |
| Shared UI | `frontend/src/styles.css`, `AppShell.tsx`, reusable native-dialog helpers kept in the consuming page unless repetition is proven. |
| Evidence | Focused Django test modules and existing `frontend/src/*.test.ts`; seed migrations and README demo instructions last. |

## Task 1: Auth/session and responsive shell (`LOGIN`)

**Files:**
- Modify: `backend/config/settings.py`, `backend/accounts/{serializers,views,urls}.py`, `backend/accounts/tests/test_accounts.py`
- Create: `frontend/src/session.ts`, `frontend/src/session.test.ts`, `frontend/src/AppShell.tsx`
- Modify: `frontend/src/{api,auth,main,styles}.tsx`, `frontend/src/{api,auth}.test.ts`, `frontend/src/pages/LoginPage.tsx`

**Interfaces:** `POST /auth/login` accepts `{email,password}` and returns `{access_token,user}` for an active user; `GET /auth/me` returns `User`; `POST /auth/logout` returns `204`. `roleHome(role: Role)` returns `/admin/users`, `/teacher/classes`, or `/student/classes`; `api<T>()` rejects a structured `{status, detail, fields?}` error and handles every `401` once.

- [ ] **Step 1: Write failing backend tests for inactive login (`401`), login response shape, authenticated logout (`204`), and a token signed with a previous startup key rejected by `/auth/me`.**

```python
response = self.client.post("/api/auth/login", {"email": inactive.email, "password": "pw"})
self.assertEqual(response.status_code, 401)
self.assertEqual(set(response.data), {"access_token", "user"})
```

- [ ] **Step 2: Run `cd backend; python manage.py test accounts -v 2`; confirm the new cases fail.**
- [ ] **Step 3: Generate `JWT_SIGNING_KEY = secrets.token_urlsafe(64)` once at settings import, configure SimpleJWT to use it, return the stated login response, and add authenticated logout. Check `is_active` before token issuance.**
- [ ] **Step 4: Write failing frontend tests for refresh token use, 401 single cleanup/redirect, failed logout cleanup, unknown route, and role mismatch.**

```ts
await expect(api("/auth/me")).rejects.toMatchObject({ status: 401 });
expect(sessionStorage.getItem("accessToken")).toBeNull();
```

- [ ] **Step 5: Implement `session.ts`, central 401 handling, route table guarded by `/auth/me`, and `AppShell`. Render sidebar at `>=768px`, horizontal scroll nav below it, and Logout as the last action. Validate Login email/password before request, retain its inline API error, and redirect an already-authenticated user to `roleHome`.**
- [ ] **Step 6: Run `cd backend; python manage.py test accounts -v 2` and `cd frontend; npm test; npm run build`; all pass. Commit `feat: add session routing and shell`.**

## Task 2: Admin account management and audit (`ADMIN-USERS`, `ADMIN-AUDIT`)

**Files:**
- Modify: `backend/accounts/{models,serializers,views,urls}.py`, `backend/accounts/tests/test_accounts.py`, `backend/audit/{serializers,views}.py`, `backend/audit/tests/test_audit.py`
- Create: `backend/accounts/migrations/0003_user_profile.py`
- Modify: `frontend/src/{auth,styles}.tsx`, `frontend/src/pages/{AdminUsersPage,AuditLogPage}.tsx`, focused frontend tests

**Interfaces:** `User` adds `full_name`, `phone`, `date_of_birth`, `gender`, and `address`. Admin-only `GET /users?q=&role=` returns active Teacher/Student only; `POST /users` creates one; `PATCH /users/:id` changes only profile fields and optional `new_password`; `DELETE /users/:id` soft-deactivates. `GET /audit-logs` returns timestamp, actor display data, event, target, and safe metadata.

- [ ] **Step 1: Write failing serializer/API tests for trimmed profile boundaries, lowercased unique email, immutable email/role, Admin exclusion, active-only search/filter, password reset, and deactivation blocks for active Class assignment/enrollment.**

```python
response = self.admin_client.post("/api/users", {"full_name": " A ", "email": "A@EXAMPLE.TEST", "password": "password1", "role": "ADMIN"})
self.assertEqual(response.status_code, 422)
```

- [ ] **Step 2: Implement database fields and migration; enforce full name 2-100, password 8-128, phone `+?` plus 9-15 digits, DOB before today, `NAM|NU|KHAC`, and address <=255. Reject Admin target/listing/mutation and use `set_password(new_password)`.**
- [ ] **Step 3: Add `DELETE`, case-insensitive `q`/role filtering, safe account audit entries, and the Class-aware deactivation query. Run `cd backend; python manage.py test accounts audit -v 2` and make it pass.**
- [ ] **Step 4: Write failing UI tests for 300 ms debounce, only All/Teacher/Student filter choices, native create/edit dialog, read-only email/role on edit, confirmation before deactivation, `422` retention, and audit loading/empty/error states.**
- [ ] **Step 5: Implement filtered account rows/cards and one native account dialog. Deactivate removes a row only after `204`. Render the audit table as the only `.table-responsive` region, without sensitive metadata.**
- [ ] **Step 6: Run `cd frontend; npm test; npm run build`; inspect both screens at 320 px and desktop. Commit `feat: manage active teacher and student accounts`.**

## Task 3: Admin-owned Classes and Teacher coursework (`ADMIN-CLASSES`, `ADMIN-CLASS-DETAIL`, `TEACHER-CLASSES`, `TEACHER-CLASS-DETAIL`)

**Files:**
- Rename/modify: `backend/cohorts/` to `backend/classes/`; update `backend/config/{settings,urls}.py`; replace references in account/audit tests and migrations safely
- Create: `backend/classes/migrations/0001_initial.py`, `backend/classes/tests/test_classes.py`, `backend/assignments/{__init__,models,serializers,views,urls}.py`, migrations and `tests/test_assignments.py`
- Replace: `frontend/src/cohorts.ts`, `frontend/src/pages/{TeacherCohortsPage,StudentCohortsPage,CohortPage}.tsx`
- Create: `frontend/src/{classes,assignments}.ts`, `frontend/src/pages/{AdminClassesPage,AdminClassDetailPage,TeacherClassesPage,TeacherClassDetailPage}.tsx`
- Modify: `frontend/src/{main,styles}.tsx`, focused frontend tests

**Interfaces:** `Class(teacher,name,description,starts_at,ends_at)` has unique `(class,student)` `Enrollment`. `GET/POST /classes?q=`, `GET/PATCH /classes/:id`, `GET /classes/:id/students?q=`, and `POST/DELETE /classes/:id/enrollments/:student_id` implement the role matrix. Assignment endpoints are `GET/POST /classes/:id/assignments`, `GET/PATCH /assignments/:id`, and `PUT /assignments/:id/rubric`.

- [ ] **Step 1: Write failing Class API tests for Admin-only creation/update/enrollment, active immutable Teacher, `starts_at < ends_at`, scoped `q`, Teacher/Student read ownership, before/during/after Class operations, duplicate/inactive enrollment, and forbidden removal after end or when a submission exists.**

```python
response = self.admin_client.post(f"/api/classes/{self.class_.id}/enrollments", {"student_id": inactive.id})
self.assertEqual(response.status_code, 422)
```

- [ ] **Step 2: Replace the Teacher-owned cohort model/routes with the Class model/routes. Apply `404` to unavailable Class data, `403` to known disallowed operations, and audit every successful mutation. Run `cd backend; python manage.py test classes accounts audit -v 2`.**
- [ ] **Step 3: Write failing Assignment/Rubric tests for assigned-Teacher-only mutation, Class-open restriction, title/description limits, fixed maximum 100, future in-period creation deadline, and atomic rubric replacement totaling exactly 100.**
- [ ] **Step 4: Implement `Assignment` and `RubricCriterion`; validate all criteria before replacing, calculate no client-provided total, and audit create/edit/rubric success. Run `cd backend; python manage.py test assignments classes -v 2`.**
- [ ] **Step 5: Implement Admin Class card/list/detail dialogs: one active Teacher at creation, immutable thereafter, student scoped search/add/remove, loading/empty/error states, and no Class delete UI.**
- [ ] **Step 6: Implement Teacher card list with no create/edit Class controls and one detail route. Normalize missing/invalid `tab` to `students`; make roster read-only; render assignment cards plus create/edit/rubric dialogs only on `assignments`. Keep pending values/messages and prevent double submit.**
- [ ] **Step 7: Run backend Class/Assignment tests plus `cd frontend; npm test; npm run build`; manually prove cross-Teacher Class request yields no other Teacher data. Commit `feat: add admin-owned classes and coursework`.**

## Task 4: Student work and Teacher grading (`STUDENT-CLASSES`, `STUDENT-ASSIGNMENTS`, `TEACHER-GRADING`)

**Files:**
- Create: `backend/submissions/{__init__,models,serializers,views,urls}.py`, migrations, `tests/test_submissions.py`
- Modify: `backend/config/{settings,urls}.py`, `backend/classes/views.py`, `backend/assignments/views.py`
- Create: `frontend/src/submissions.ts`, `frontend/src/pages/{StudentClassesPage,StudentAssignmentsPage,TeacherGradingPage}.tsx`
- Modify: `frontend/src/{main,styles}.tsx`, focused frontend tests

**Interfaces:** `POST /assignments/:id/submissions` accepts multipart `file,note`; `GET /assignments/:id/my-submissions`, `GET /assignments/:id/my-result`, `GET /submissions/:id/download`, `GET /assignments/:id/submissions`, `GET /submissions/:id`, and `PUT /submissions/:id/grade` match the spec. Submission serializes display metadata only; grade response supplies manual/rubric result fields.

- [ ] **Step 1: Write failing submission tests for enrollment/period/deadline/graded lock, DOC/DOCX/PDF/MP4/MOV extension and MIME validation, 1 GB limit before storage, note <=1000, v1/v2 sequencing, own history, and authorized download with no path field.**

```python
response = self.student_client.post(f"/api/assignments/{self.assignment.id}/submissions", {"file": SimpleUploadedFile("work.exe", b"x", content_type="application/pdf")}, format="multipart")
self.assertEqual(response.status_code, 422)
```

- [ ] **Step 2: Implement private media storage, a `(assignment, student, version)` uniqueness constraint, atomic next-version allocation, validate before storage, and `FileResponse` after Student-owner/Teacher-owner authorization. Audit only safe submission metadata. Run `cd backend; python manage.py test submissions -v 2`.**
- [ ] **Step 3: Write failing grade tests for latest-per-Student listing, assigned Teacher boundary, manual integer 0-100, rubric criterion range/shape, server-calculated total, audit event, and post-grade upload rejection.**
- [ ] **Step 4: Implement Grade/CriterionScore transactionally. Grade only the latest submission while Class is open; persist either manual score or every rubric criterion and compute total server-side. Run `cd backend; python manage.py test submissions assignments classes -v 2`.**
- [ ] **Step 5: Implement Student enrolled-Class cards, then assignment status cards with exactly Open/Submit, Submitted/History, Graded/score/Result, or Closed/no action. Use native submit/history/result dialogs with file name/size, client checks, FormData, pending disable, preserved `422`, and loading/empty/error state.**
- [ ] **Step 6: Implement the Teacher grading two-column page: selected submission/download left; previous/next labelled icon buttons with title/tooltips and `current / total`; manual or rubric form right; narrow-width stack; refresh and clamp selection after save.**
- [ ] **Step 7: Run backend tests and `cd frontend; npm test; npm run build`; prove a different Student and Teacher cannot read/download/grade the submission. Commit `feat: add private submissions and grading`.**

## Task 5: Demo data and acceptance evidence

**Files:**
- Modify: existing account seed migration/test, `README.md`, all focused Django/Vitest tests only for observed gaps
- Create: follow-on `classes`, `assignments`, and `submissions` data migrations containing stable demo rows

**Interfaces:** Migration data creates one Admin, active Teacher and Student, one open and one ended Class as needed, enrollment, an assignment/rubric totaling 100, versioned submissions, and one grade; repeated `migrate` leaves one row per natural key.

- [ ] **Step 1: Write a failing idempotence test that migrates twice and checks stable users, Class/enrollment, rubric, submissions, and grade.**

```python
call_command("migrate", verbosity=0)
call_command("migrate", verbosity=0)
self.assertEqual(User.objects.filter(email="teacher.anh@example.com").count(), 1)
```

- [ ] **Step 2: Add `get_or_create` seed migrations and README setup/walkthrough. Never put a password, token, raw file content, or absolute storage path into audit/seed display data.**
- [ ] **Step 3: Add one regression test each for restart-invalid token, account deactivation guard, Class ownership, duplicate enrollment, rubric total, late/graded submission, cross-role download/grade, and safe audit metadata. Run `cd backend; python manage.py test -v 2`.**
- [ ] **Step 4: Run `cd frontend; npm test; npm run build`. At 320 px and desktop inspect every listed screen: valid submit, representative client invalid input, matching `422`, pending double-submit prevention where applicable, loading, empty, request error, and ownership/role redirect. Confirm `document.documentElement.scrollWidth <= window.innerWidth` on every non-table screen.**
- [ ] **Step 5: Repair only demonstrated defects, rerun both suites and the manual acceptance flow, then commit `test: verify product redesign acceptance`.**

## Coverage Review

- Auth/session, shared responsive navigation, and route map: Task 1.
- Account profile/admin restrictions, audit safety, and account screen states: Task 2.
- Admin Class ownership/enrollment, Teacher class/coursework, period controls, and rubric: Task 3.
- Student status cards/files/history/results and Teacher latest-submission grading: Task 4.
- Seed data, all required evidence, 320 px QA, and end-to-end walkthrough: Task 5.

No new dependency, delete endpoint, public file URL, alternate route, Teacher Class ownership, or separate Student dashboard is planned.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-27-product-redesign-implementation.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task and review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.
