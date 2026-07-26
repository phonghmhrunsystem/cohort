# Phase 06 — Role-Focused Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the browser UI for admin, teacher, and student workflows using the completed API.

**Architecture:** React Router holds public/protected routes; a small auth context holds the access token/current user; feature pages call an API client. Route guards improve UX only—each API remains the authority.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, React Router, browser Fetch API.

## Global Constraints

- Never duplicate server business rules as an authorization mechanism.
- Every input has a visible label, keyboard focus state, loading state, empty state, and field/API error rendering.
- Send multipart `FormData` without manually setting its `Content-Type`.
- Store no password beyond the submitted login form and never display raw storage paths.

### Task 1: Shared auth, shell, and API client

**Files:**
- Create: `frontend/src/api/client.ts`, `frontend/src/auth/AuthProvider.tsx`, `frontend/src/auth/RequireRole.tsx`, `frontend/src/layout/AppShell.tsx`, `frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/ForbiddenPage.tsx`, `frontend/src/router.tsx`
- Modify: `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/index.css`

**Interfaces:**
- Consumes: `POST /api/auth/login/`, `GET /api/auth/me/`.
- Produces: `useAuth()`, `apiFetch(path, options)`, role-aware routes and authenticated shell.

- [ ] **Step 1: Implement typed API error handling, token persistence, `/auth/me` bootstrap, login form, and role guard**
- [ ] **Step 2: Build the shared sidebar/breadcrumb shell and verify keyboard navigation manually**
- [ ] **Step 3: Run `npm run build`; Phase 07 supplies the browser regression check**
- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "feat: add frontend authentication shell"
```

### Task 2: Admin and teacher management slices

**Files:**
- Create: `frontend/src/features/admin/UsersPage.tsx`, `frontend/src/features/admin/AuditLogPage.tsx`, `frontend/src/features/cohorts/CohortListPage.tsx`, `frontend/src/features/cohorts/CohortDetailPage.tsx`, `frontend/src/features/assignments/AssignmentEditorPage.tsx`
- Modify: `frontend/src/router.tsx`, `frontend/src/api/client.ts`

**Interfaces:**
- Consumes: account/audit, cohort/enrollment, assignment/rubric API endpoints.
- Produces: admin account controls and teacher cohort/assignment/rubric screens.

- [ ] **Step 1: Implement account create/edit/deactivation and read-only audit list with API errors**
- [ ] **Step 2: Implement teacher cohort create/detail, student enrollment, assignment editor, and rubric editor**
- [ ] **Step 3: Show rubric total and disable submit until it equals 100; preserve server `422` error display**
- [ ] **Step 4: Run `npm run build` and commit**

```bash
git add frontend
git commit -m "feat: add admin and teacher management screens"
```

### Task 3: Student submission and grading/result slices

**Files:**
- Create: `frontend/src/features/dashboard/TeacherDashboard.tsx`, `frontend/src/features/dashboard/StudentDashboard.tsx`, `frontend/src/features/submissions/StudentAssignmentPage.tsx`, `frontend/src/features/grading/GradingPage.tsx`, `frontend/src/features/grading/ResultPage.tsx`
- Modify: `frontend/src/router.tsx`, `frontend/src/api/client.ts`

**Interfaces:**
- Consumes: submission history/latest list/upload/download and grading/result endpoints.
- Produces: complete teacher-to-student browser flow.

- [ ] **Step 1: Implement student assignment details, labelled file upload, version history, deadline/graded state, and protected download link**
- [ ] **Step 2: Implement teacher latest-submission list and grade form for rubric/manual assignments**
- [ ] **Step 3: Implement student result with feedback and criterion breakdown**
- [ ] **Step 4: Run `npm run build` and commit**

```bash
git add frontend
git commit -m "feat: add submission grading and result screens"
```
