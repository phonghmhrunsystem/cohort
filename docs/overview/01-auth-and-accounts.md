# Feature: Auth & Accounts

Part of [00-system-overview](00-system-overview.md). Backend app: `accounts/`. Frontend: `LoginPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `ChangePasswordPage`, `AdminUsersPage`, `AdminUserViewPage`, `AdminUserEditPage`, `ProfilePage`, `ProfileEditPage`.

## 1. Purpose

Admin-provisioned identity: no self-registration. Covers login, forced password change, self-service password reset via emailed link, and admin CRUD (create/view/edit/enable-disable/delete) on Teacher/Student accounts.

## 2. Screens (ASCII)

### 2.1 Login (`/login`)

```
+----------------------------------------------------+
|  Sign in                                            |
|                                                       |
|  Email      [______________________________]         |
|  Password   [______________________________]         |
|                                                       |
|                    [ Sign in ]                       |
|                                                       |
|                 Forgot password?                     |
+----------------------------------------------------+
```
- "Forgot password?" is a link → navigates to `/forgot-password` (own page, not an inline toggle).
- `Sign in` button is horizontally centered.
- On success: redirect to role home (`roleHome(role)`).
- On `must_change_password = true`: redirected to Change Password screen instead.

### 2.1.a Forgot password (`/forgot-password`)

```
+----------------------------------------------------+
|  Forgot password                                    |
|  Enter your email, we'll send a reset link.         |
|                                                       |
|  Email [____________________________]                |
|                                                       |
|               [ Send reset link ]                    |
+----------------------------------------------------+
```
- Always shows the same generic success message regardless of whether the email matches an account (no user enumeration).
- On submit, backend generates a reset token and emails a link: `{FRONTEND_URL}/reset-password?token=...`.

### 2.1.b Reset password (`/reset-password?token=...`)

```
+----------------------------------------------------+
|  Reset password                                      |
|                                                       |
|  New password          [______________]              |
|  Confirm new password  [______________]              |
|                                                       |
|               [ Reset password ]                     |
+----------------------------------------------------+
```
- Token missing/invalid/expired/used → error state with a link back to `/forgot-password`.
- `New password` and `Confirm new password` must match (client + server validation).
- On success: token is invalidated, redirect to `/login` with a success message.

### 2.2 Change password (forced, `/change-password`)

```
+----------------------------------------------+
|  Change password                              |
|  Set a new password to continue.              |
|                                                |
|  Temporary password   [______________]        |
|  New password         [______________]        |
|  Confirm new password [______________]        |
|                                                |
|  [ Continue ]                                 |
+----------------------------------------------+
```
- `New password` and `Confirm new password` must match.
- `Continue` → calls `POST /api/auth/change-password`, clears `must_change_password`, then redirects to role home (`roleHome(role)`).

### 2.3 Admin — Accounts (`/admin/users`)

```
+-----------------------------------------------------------------------------------------------+
| Accounts                                                              [ Create account ]        |
|                                                                                                   |
| Search [____________]  Role ( All ▾ )  Ngày tạo [____]  Ngày update [____]   [ Search ]          |
|                                                                                                   |
| Email          | Full Name    | Phone       | Ngày tạo   | Ngày update | Role    | Action                     |
| a@example.com  | Nguyen Van A | 09xxxxxxxx  | 2026-01-05 | 2026-06-01  | Teacher | View Edit Delete Đổi MK Bật/Tắt |
| b@example.com  | Tran Thi B   | 09xxxxxxxx  | 2026-02-10 | 2026-02-10  | Student | View Edit Delete Đổi MK Bật/Tắt |
+-----------------------------------------------------------------------------------------------+
                                              [ < 1 2 3 ... > ]   (10 accounts/page)
```
- Search box + Role dropdown (All / Teacher / Student) + Ngày tạo + Ngày update are filters; nothing searches on change. Search only fires when `[ Search ]` is clicked (not real-time).
- Table columns: Email, Full Name, Phone, Ngày tạo (`created_at`), Ngày update (`updated_at`), Role, Action.
- Paginated, 10 accounts/page.
- Action buttons per row: `View`, `Edit`, `Delete`, `Change Password`, `Enable/Disable`.
  - `View` → `/admin/users/{id}` (read-only).
  - `Edit` → `/admin/users/{id}/edit` (editable form).
  - `Delete` → confirm dialog, soft-deletes (`is_deleted = true`). Blocked (`422`) if the account owns/is enrolled in an active Class (same check as Disable). One-way — no restore/undelete action.
  - `Change Password` (`Đổi MK` in the table) → dialog with `New password` + `Confirm new password`, **admin types the value themselves**; nothing is generated server-side and nothing is emailed (admin is top-level privilege, and the whole point is that they can read it out to the user). Sets `must_change_password = true`, so the value the admin picked survives exactly one login.
  - `Enable/Disable` → toggles `is_active`. Disabling blocked (`422`) if tied to an active Class.
- Create dialog: `full_name`, `email`, `role` (Teacher/Student), `phone`, `date_of_birth`, `gender`, `hometown`, `address`, `initial password`.
- List/View/Edit scope: active Teacher/Student **and** disabled Teacher/Student (so admin can re-enable them). `is_deleted = true` rows are always excluded — never shown anywhere in this list, regardless of filters/pagination.

### 2.4 Profile (`/profile`, all roles)

View (`/profile`):
```
+----------------------------------------------------+
| Hồ sơ cá nhân          [ Change password ] [ Edit ]  |
| user@example.com                                     |
|                                                       |
| Full name : ...                                      |
| Phone     : ...                                      |
| DOB       : ...                                      |
| Gender    : ...                                      |
| Quê quán  : ...                                      |
| Address   : ...                                      |
+----------------------------------------------------+
```

Edit (`/profile/edit`):
```
+----------------------------------------------------+
| Chỉnh sửa hồ sơ                                       |
|                                                       |
| Full name [______________]                           |
| Phone     [______________]                           |
| DOB       [______________]                           |
| Gender    [______________]                           |
| Quê quán  [______________]                           |
| Address   [______________]                           |
|                                                       |
| [ Save changes ]   [ Cancel ]                        |
+----------------------------------------------------+
```
- `Change password` button on the View screen goes to the self-service change-password flow (authenticated, requires current password — `POST /api/auth/change-password`). Different trigger than the forced 2.2 flow, same API.

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Email + password → JWT pair |
| POST | `/api/auth/logout` | Authenticated | No server-side token invalidation; client drops the token |
| GET | `/api/auth/me` | Authenticated | Returns current user |
| PATCH | `/api/auth/me` | Authenticated | Self-edit profile fields (not email/role/password) |
| POST | `/api/auth/change-password` | Authenticated | Requires current password; clears `must_change_password` |
| POST | `/api/auth/forgot-password` | Public | By email; always `204` (no user enumeration). Generates a reset token and emails a link. |
| GET | `/api/auth/reset-password/{token}` | Public | Validates a token before rendering the form (`404`/`410` if invalid/expired) |
| POST | `/api/auth/reset-password` | Public | `{ token, new_password, confirm_new_password }` → sets password, invalidates the token |
| GET | `/api/users` | Admin | List Teacher/Student (active + disabled, excludes `is_deleted`); `?q=` name/email, `?role=TEACHER\|STUDENT`, `?created_from=&created_to=`, `?updated_from=&updated_to=`, `?page=` (10/page) |
| GET | `/api/users/{id}` | Admin | Single account detail (View/Edit screens) |
| POST | `/api/users` | Admin | Create account |
| PATCH | `/api/users/{id}` | Admin | Update account fields |
| PATCH | `/api/users/{id}/status` | Admin | Toggle `is_active` (Enable/Disable); `422` if disabling and tied to an active Class |
| POST | `/api/users/{id}/reset-password` | Admin | Body `{ new_password, confirm_new_password }` — the admin's own value, not a generated one. Sets the password + `must_change_password = true`. No email, no token. Audited as `account.password_set` ([08 §4](08-audit-log.md#4-db)) |
| DELETE | `/api/users/{id}` | Admin | Soft-delete (`is_deleted = true`); `422` if tied to an active Class |

Removed: `POST /api/password-reset-requests`, `GET /api/password-reset-requests`, `POST /api/password-reset-requests/{id}/resolve` — replaced by the self-service email-link flow above; there's no more admin-resolved queue.

## 4. DB

**`users`** (custom `AbstractUser`, `email` is `USERNAME_FIELD`)

| Field | Notes |
|---|---|
| `email` | unique |
| `password` | Django hash (never stored/logged raw) |
| `role` | `ADMIN` \| `TEACHER` \| `STUDENT` |
| `full_name`, `phone`, `date_of_birth`, `gender`, `hometown`, `address` | nullable profile fields. `hometown` (tỉnh/thành) is shown as "Quê quán" on the admin Class roster — see [02](02-classes-and-enrollment.md) |
| `must_change_password` | forces `/change-password` flow |
| `is_active` | enable/disable flag (reversible, blocks login) |
| `is_deleted` | soft-delete flag, set by admin `Delete`; excluded from all admin list/view/edit querysets |

**`password_reset_tokens`** (replaces `password_reset_requests`)

| Field | Notes |
|---|---|
| `user_id` | FK → users |
| `token_hash` | hash of the token; raw token only ever exists in the emailed link |
| `expires_at` | e.g. `created_at + 30min` |
| `used_at` | null until consumed; a token is valid only if `used_at is null and now < expires_at` |

## 5. Key functions / rules

- `accounts/views.py::IsAdmin` — role check that also blocks any admin whose own `must_change_password` is still true.
- `UsersView.delete` (soft-delete) — checks `user.classes.filter(is_active=True, ends_at__gt=now)` and `user.enrollments.filter(classroom__is_active=True, classroom__ends_at__gt=now)`; `422` if either is non-empty; else sets `is_deleted = true`. Same check as the disable toggle. No restore path. ("Active Class" = `is_active` **and** not yet ended — a disabled or ended Class never blocks an account operation; see [02](02-classes-and-enrollment.md).)
- `UsersView` status toggle — same active-Class check applied when disabling (`is_active → false`); no check when enabling.
- `account_metadata(user)` — builds the audit metadata dict for account writes; excludes `password`.
- Every mutating account view wraps its write in `transaction.atomic()` + `write_audit(...)` (see [08-audit-log](08-audit-log.md)). Actions this app writes: `account.created`, `account.updated` (admin edit), `account.self_updated` (`PATCH /api/auth/me`), `account.deactivated` / `account.reactivated` (the status toggle, one action each way), `account.deleted` (soft-delete), `account.password_changed` (user changes their own — both the forced flow and the emailed-link reset), `account.password_set` (admin sets someone else's). Login, logout and `forgot-password` write nothing: they are not domain writes, and auditing failed logins would be a security feature nobody asked for.
- Forgot-password is deliberately silent about whether the email exists (`204` either way) to avoid account enumeration.
- Forgot-password request invalidates (`used_at = now`) any prior unused, unexpired token for that user before issuing a new one — only the newest link works.
- `POST /api/auth/forgot-password` is rate-limited: max 1 request/min per email, and max 5 requests/hour per IP (via `django-ratelimit`). Rate-limited requests still return `204` — no signal leaked.
- Email sending is mocked via Django's console email backend (`EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'`) — prints to server stdout/log, never returned in the API response. Swapping to real SMTP later is a settings-only change; upgrade to `filebased.EmailBackend` or a dev SMTP catcher (Mailhog/Mailtrap) only if server-log access isn't enough.

## 6. Edge cases

- Reset link invalid/expired/already used → error on the reset-password screen; user must request a new one.
- Forgot-password for an unknown/inactive/deleted/`ADMIN` email → still `204`, nothing created (no enumeration).
- Viewing/editing/deleting/toggling a `user_id` that is Admin or `is_deleted` → `404` (queryset excludes them).
- A disabled (`is_active=false`) Teacher/Student is still visible/viewable/editable by admin, so it can be re-enabled.
- Resetting an already-used or expired token → `422`/`410`.
- Rate-limited `forgot-password` requests → still `204`, no email sent.
