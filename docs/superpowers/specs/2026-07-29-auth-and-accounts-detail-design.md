# Auth & Accounts — detailed implementation design

## 1. Authority and scope

This is the implementation companion to [00-system-overview](../../overview/00-system-overview.md) and [01-auth-and-accounts](../../overview/01-auth-and-accounts.md). Those two files remain the product authority; this file turns their Auth & Accounts requirements into database, API, UI, and verification work.

Goal: make admin-provisioned accounts safe and usable in the class-management workflow. The password-reset approval queue is removed completely and replaced by a self-service, emailed, single-use reset link.

In scope: accounts data/API, audit, authentication/route guards, and the shared responsive shell that connects identity with Admin, Teacher, and Student classroom work.

Out of scope: registration, MFA, refresh-token rotation, account restore, dark mode, calendar/global search, real SMTP, and dashboard-only backend endpoints.

## 2. Current gap analysis

| Area | Current implementation | Target improvement |
| --- | --- | --- |
| Lifecycle | Deactivate is treated as delete; inactive accounts disappear from Admin and cannot be restored. | Add irreversible soft delete distinct from reversible disable. |
| User data | No hometown, created/update timestamps, or deletion state. | Add the fields required by account filters and Class roster. |
| Reset | PasswordResetRequest is an Admin queue with list/resolve endpoints. | Replace it with hashed, expiring, single-use tokens sent by email; remove the queue stack. |
| Admin API | List is unpaginated/active-only; detail GET, status, direct reset and date filters are absent. | Implement the contract in section 4. |
| Auth config | JWT signing key changes per server start. | Stable configuration key; client remains access-token only. |
| UI | Frontend source was intentionally deleted in the latest commit. | Rebuild React/Vite/TypeScript UI with a modern class-management shell. |

## 3. Data model and migrations

### 3.1 Users

Keep the custom AbstractUser with normalized email as the username. Add:

| Field | Constraint | Purpose |
| --- | --- | --- |
| hometown | nullable CharField(100) | Province/city shown as Quê quán in roster and profile. |
| is_deleted | BooleanField(default false), indexed | Irreversible Admin soft delete. |
| created_at | auto_now_add, indexed | List/filter timestamp. |
| updated_at | auto_now, indexed | List/filter timestamp. |

Existing fields stay: email unique, password hash, role, profile fields, is_active, and must_change_password. Email is trim/lowercase at every write. Email and role are immutable after creation.

### 3.2 Password reset tokens

Create PasswordResetToken:

| Field | Constraint | Purpose |
| --- | --- | --- |
| user | FK User, CASCADE, indexed | Reset target. |
| token_hash | unique SHA-256 hash | Raw token never enters the database. |
| created_at | auto_now_add | Support timing. |
| expires_at | indexed datetime | Created time plus 30 minutes. |
| used_at | nullable datetime | Valid only when null and unexpired. |

Generate a 32-byte url-safe token. Store its SHA-256 hash only. Under one transaction, invalidate any previous usable tokens for the user, create the new token, then send the email from transaction.on_commit. The link is FRONTEND_URL/reset-password?token=raw-token. Console email is enough for local development.

### 3.3 Migration order

1. Add users fields and PasswordResetToken.
2. Ship replacement API/UI/tests.
3. Delete PasswordResetRequest, its unique constraint/table, serializers, views, routes, tests, page, and navigation link.

Do not migrate pending queue records. They must never grant a reset under the abandoned workflow. User/Class/Enrollment data is retained.

## 4. API contract

Paths below are relative to /api. Status convention: 401 unauthenticated, 403 wrong role, 404 missing/out-of-scope, 422 valid request that fails validation or a business rule. Field errors use {field: [message]}; business errors use {detail: message}.

### 4.1 Authentication and profile

| Method | Path | Contract |
| --- | --- | --- |
| POST | /auth/login | email/password returns access_token and user. Bad, inactive, or deleted credentials all return 401. |
| POST | /auth/logout | 204; client drops the access token. |
| GET | /auth/me | Current user; available while password change is forced. |
| PATCH | /auth/me | Profile fields only; identity, role, status, deletion and password rejected. |
| POST | /auth/change-password | current_password, new_password, confirm_new_password; 204 and clears must_change_password. |
| POST | /auth/forgot-password | email; always 204. Only active, non-deleted Teacher/Student accounts get email. Limit 1/min per email and 5/hour per IP; limit response is still 204. |
| GET | /auth/reset-password/{token} | 204 if usable; 404 invalid/used; 410 expired. |
| POST | /auth/reset-password | token, new_password, confirm_new_password; atomically consume token and set password. |

User response fields: id, full_name, email, role, phone, date_of_birth, gender, hometown, address, is_active, must_change_password. Never return password/hash/token/deletion state to a non-Admin caller.

### 4.2 Admin accounts

Use one manageable_users queryset: Teacher/Student where is_deleted is false. Every Admin operation uses it, so disabled accounts can be re-enabled but deleted accounts return 404.

| Method | Path | Contract |
| --- | --- | --- |
| GET | /users | q, role, created_from/to, updated_from/to, page. Sort -updated_at,-id; 10/page; return count, next, previous, results. |
| POST | /users | Create Teacher/Student only; require full name, email, role, initial password; 201 user and must_change_password true. |
| GET | /users/{id} | Detail for View/Edit. |
| PATCH | /users/{id} | Admin profile fields only. |
| PATCH | /users/{id}/status | Body is_active. Disable is blocked by an active Class; enable always allowed. |
| POST | /users/{id}/reset-password | new_password/confirm_new_password; Admin chooses password, no email/token, must_change_password true. |
| DELETE | /users/{id} | Set is_deleted true and is_active false; active-Class guard; no restore. |

The active-Class guard is Class.is_active AND ends_at > timezone.now(), evaluated for both owned classes and student enrollments. Every password write uses Django configured password validators, transaction.atomic, and an audit entry.

### 4.3 Explicitly deleted legacy API

Remove without compatibility alias:

- GET /password-reset-requests
- POST /password-reset-requests
- POST /password-reset-requests/{id}/resolve
- PasswordResetRequest model, serializers/views/tests, queue page and Admin nav entry.

The only recovery API is /auth/forgot-password plus reset-password routes. Admin direct reset is /users/{id}/reset-password.

## 5. Authorization, audit, and concurrency

- IsAdmin requires authenticated ADMIN and must_change_password false; apply it to every users route, not duplicated role checks.
- Forced users can reach only auth/me, auth/change-password, and auth/logout. Backend rejects all Class/dashboard/profile-edit/Admin access; client routes them to change-password.
- Login rejects is_deleted as well as inactive users.
- Reset submit locks the token, rechecks used_at/expiry, then writes password and used_at together. A competing second submit fails.
- Write audits for account.created, account.updated, account.self_updated, account.deactivated, account.reactivated, account.deleted, account.password_changed, and account.password_set.
- Audit metadata excludes passwords, hashes, tokens, reset URLs, secrets, and arbitrary text.

## 6. UI design

### 6.1 Shared shell

Use React, Vite, TypeScript, Tailwind CSS, React Router, and small shared primitives: Button, Card, Badge, Field, Table, EmptyState, Spinner, Alert, and the native dialog wrapper. Do not add a component library.

Desktop is a dark-indigo role sidebar with a light content canvas, topbar user/logout menu, and notification bell for Teacher/Student. Mobile uses a topbar and focus-trapped drawer with backdrop, Escape close, body-scroll lock. Tables scroll horizontally; row actions become an accessible menu rather than disappearing.

Forms are controlled, use noValidate, preserve drafts after 422, and show both client/server errors in the Field error slot. Keep useful native input types and maximum lengths. Visible focus, labels, focus restore, and text or accessible names for every icon are required.

### 6.2 Routes and guards

Public: /login, /forgot-password, /reset-password?token=...
Forced: /change-password
Protected: /dashboard, /profile, /profile/edit, /admin/users, /admin/users/:id, /admin/users/:id/edit, and Class routes owned by documents 02–08.
Fallback: NotFoundPage.

AuthProvider gets auth/me once at startup and exposes user, loading, refresh. RequireRole guards routes: anonymous goes to login, wrong role to dashboard, forced user to change-password. roleHome always returns /dashboard. Store only access token in sessionStorage; a 401 clears it once then routes to login.

### 6.3 Auth screens

| Route | Behaviour |
| --- | --- |
| /login | Centered brand card: email/password, reveal button, primary sign in, loading, inline alert, forgot link. Success refreshes state then opens change-password or dashboard. |
| /forgot-password | Same public card: email and Send reset link. After valid submit always show the same check-email notice. |
| /reset-password | Read query token. Missing/invalid/expired state links back to forgot-password. New/confirm password success returns to login with one-time notice. |
| /change-password | Sparse protected card with current/temporary, new, confirm password. No route bypass. Success refreshes state and opens dashboard. |

### 6.4 Admin Accounts workspace

The Accounts page is a responsive management workspace:

    Accounts                                      [ + Create account ]
    Search [____] Role [All] Created [date] Updated [date] [Search]
    Email | Full name | Phone | Created | Updated | Role | Status | Actions
    Pagination: Previous 1 2 Next                 10 accounts/page

Filters are draft values and fetch only on Search. Preserve filters after View/Edit. Show distinct loading, empty, and failure states. A row action menu contains View, Edit, Set password, Enable/Disable, Delete. Destructive actions ask confirmation and explain active-Class blocks.

Create and Set password use dialogs. Create includes all profile fields from 01. View is read-only; Edit is a focused page. Email/role appear immutable. Status is icon plus text; deleted rows never render.

### 6.5 Classroom integration

Profile is an identity card with Edit profile and Change password. The role shell is the entry point to classroom management:

| Role | Navigation |
| --- | --- |
| Admin | Dashboard, Accounts, Classes, Audit log |
| Teacher | Dashboard, My Classes, Profile, notifications |
| Student | Dashboard, My Classes, Profile, notifications |

Dashboard reuses class lists/progress/deadlines and notifications; it is a launchpad, not a new gradebook or roster endpoint.

## 7. Acceptance criteria

- Migration preserves users/classes/enrollments, adds lifecycle fields, and drops the reset-request table.
- Known, unknown, inactive, deleted, and Admin emails all receive identical 204 forgot responses. Only eligible users receive a console email.
- Used, expired, malformed, or raced tokens cannot change a password. A new request invalidates old tokens.
- Disabled accounts are visible/editable to Admin; deleted accounts are 404; disable/delete of anyone attached to an active Class returns 422.
- Tests cover filtering, pagination, forced routes, status/direct reset/delete, audit safety, recovery races, and no executable reference to the legacy queue.
- Frontend route/guard/form tests cover inline errors and retained drafts. Run typecheck, tests, production build, and keyboard/mobile checks on auth, accounts, profile, and one Class screen.

## 8. Next plan boundary

Implement in dependency order: models/migrations → serializers/services and legacy deletion → views/routes/tests → frontend tooling/router/auth state → shell/primitives → auth pages → Accounts/Profile → dashboard/class navigation → complete verification. Legacy queue removal and replacement recovery ship in the same increment.
