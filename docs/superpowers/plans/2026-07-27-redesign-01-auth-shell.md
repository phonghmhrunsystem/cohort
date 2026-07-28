# Authentication and Responsive Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver durable browser-session authentication, role routing, and the responsive authenticated shell.

**Architecture:** Django/DRF issues a startup-key JWT and owns active-user checks. React keeps only `access_token` in `sessionStorage`; the typed API layer owns a single `401` cleanup path and `AppShell` owns role navigation.

**Tech Stack:** Django, DRF, SimpleJWT, React, TypeScript, Vite, Vitest.

## Scope and contract

- `POST /auth/login` accepts `{email,password}` and returns `{access_token,user}` for active users.
- `GET /auth/me` returns `User`; authenticated `POST /auth/logout` returns `204`.
- `roleHome(role)` maps Admin, Teacher, Student to `/admin/users`, `/teacher/classes`, `/student/classes`.
- `/login` is public. Unknown, missing-session, and role-incompatible routes clear session then redirect there.

### Task 1: Backend session contract

**Files:** modify `backend/config/settings.py`, `backend/accounts/{serializers,views,urls}.py`, `backend/accounts/tests/test_accounts.py`.

- [ ] Add failing tests for inactive login (`401`), response keys, authenticated logout (`204`), and a token signed before restart rejected by `/auth/me`.
- [ ] Run `cd backend; python manage.py test accounts -v 2` and confirm failure.
- [ ] Generate `JWT_SIGNING_KEY = secrets.token_urlsafe(64)` once at settings import, configure SimpleJWT, check `is_active` before issue, return the prescribed response, and add logout.
- [ ] Rerun `cd backend; python manage.py test accounts -v 2`.

### Task 2: Browser session and protected routes

**Files:** create `frontend/src/{session.ts,session.test.ts,AppShell.tsx}`; modify `frontend/src/{api,auth,main,styles}.tsx` and focused API/auth tests.

- [ ] Add failing tests for token handling, one `401` cleanup/redirect, failed-logout cleanup, unknown route, and role mismatch.
- [ ] Implement structured `{status, detail, fields?}` API failures, one central `401` handler, route guard using `/auth/me`, `roleHome`, and Login validation/redirect for authenticated users.
- [ ] Render desktop sidebar at `>=768px`, horizontal mobile navigation below it, with Logout last; preserve Login and `422` form errors.
- [ ] Run `cd frontend; npm test; npm run build`.

## Feature gate

`accounts` tests plus frontend tests/build pass. Login, stale token, logout failure, unknown route, and wrong role all finish at `/login`.
