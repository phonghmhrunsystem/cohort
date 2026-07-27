# Admin Accounts and Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Admin manage active Teacher/Student accounts and inspect safe append-only audit events.

**Architecture:** `accounts` owns profile validation, password changes, active filtering, and Class-aware deactivation. `audit` exposes display-safe events only; the React pages use one native create/edit dialog.

**Tech Stack:** Django, DRF, React, TypeScript, Vitest.

## Scope and contract

- `User` adds `full_name`, `phone`, `date_of_birth`, `gender`, `address`; Admin users cannot be listed or mutated.
- Admin `GET /users?q=&role=` returns active Teachers/Students; `POST`, profile-only `PATCH`, and soft `DELETE` are supported.
- `GET /audit-logs` exposes timestamp, actor display data, event, target, and safe metadata only.

### Task 1: Account API and audit safety

**Files:** modify `backend/accounts/{models,serializers,views,urls}.py`, `backend/audit/{serializers,views}.py`, account/audit tests; create `backend/accounts/migrations/0003_user_profile.py`.

- [ ] Add failing tests for trim/bounds, lowercase unique email, immutable email/role, Admin exclusion, active query/filter, reset, and deactivation blocked by active Class assignment/enrollment.
- [ ] Implement full name `2..100`, password `8..128`, phone `+?` plus `9..15` digits, past DOB, `NAM|NU|KHAC`, address `<=255`; use `set_password(new_password)`.
- [ ] Add case-insensitive `q`, role filtering, soft delete, safe audit metadata, and the Class-aware guard.
- [ ] Run `cd backend; python manage.py test accounts audit -v 2`.

### Task 2: Admin screens

**Files:** modify `frontend/src/{auth,styles}.tsx`, `frontend/src/pages/{AdminUsersPage,AuditLogPage}.tsx`, and focused tests.

- [ ] Add failing UI tests for 300 ms debounce, allowed filter values, native create/edit dialog, read-only email/role on edit, deactivate confirmation, retained `422`, and audit loading/empty/error states.
- [ ] Implement rows/cards, one account dialog, and removal only after `204`; render audit as the sole `.table-responsive` region without sensitive metadata.
- [ ] Run `cd frontend; npm test; npm run build`; inspect both screens at 320 px and desktop.

## Feature gate

Only active Teacher/Student records are manageable. Any account referenced by an active Class relationship stays active; audit output never includes passwords, tokens, raw file data, or storage paths.
