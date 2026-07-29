# Feature: Auth & Accounts

Part of [00-system-overview](00-system-overview.md). Backend app: `accounts/`. Frontend: `LoginPage`, `ChangePasswordPage`, `AdminUsersPage`, `PasswordResetRequestsPage`, `ProfilePage` (self-profile part).

## 1. Purpose

Admin-provisioned identity: no self-registration. Covers login, forced password change, self-service password-reset request, admin resolution of that request, and admin CRUD on Teacher/Student accounts.

## 2. Screens (ASCII)

### 2.1 Login (`/login`)

```
+----------------------------------------------------+
|  Sign in                                            |
|                                                       |
|  Email      [______________________________]         |
|  Password   [______________________________]         |
|                                                       |
|  [ Sign in ]                                         |
|                                                       |
|  Forgot password?                     <- toggles:    |
|  Email [________________] [ Send ]                   |
+----------------------------------------------------+
```
- On success: redirect to role home (`roleHome(role)`).
- On `must_change_password = true`: redirected to Change Password screen instead.

### 2.2 Change password (forced, `/change-password`)

```
+----------------------------------------------+
|  Change password                              |
|  Set a new password to continue.              |
|                                                |
|  Temporary password [______________]          |
|  New password        [______________]         |
|                                                |
|  [ Continue ]                                 |
+----------------------------------------------+
```

### 2.3 Admin — Accounts (`/admin/users`)

```
+----------------------------------------------------------------+
| Accounts                                    [ Create account ] |
| Manage active Teacher and Student accounts.                    |
|                                                                  |
| [ Search: Name or email____________ ]  ( All )( Teacher )(Student)
|                                                                  |
| +--------------------------------------------------------------+
| | Nguyen Van A                          [Edit] [Deactivate]    |
| | a@example.com                                                 |
| +--------------------------------------------------------------+
| | Tran Thi B                            [Edit] [Deactivate]    |
| | b@example.com                                                 |
| +--------------------------------------------------------------+
+----------------------------------------------------------------+

Create/Edit dialog: full_name, email, role (Teacher/Student), phone,
date_of_birth, gender, address, initial/updated password (create only).

Deactivate confirm dialog: [Vô hiệu hóa] button. Blocked with an error
if the account owns or is enrolled in a Class that hasn't ended yet.
```

### 2.4 Admin — Password reset requests (`/admin/password-reset-requests`)

```
+----------------------------------------------------+
| Password reset requests                              |
|                                                       |
| student@example.com                                  |
|   [ Temporary password_______ ] [ Resolve ]          |
|                                                       |
| (No pending requests.)                                |
+----------------------------------------------------+
```

### 2.5 Profile (`/profile`, all roles) — self-edit part

```
+----------------------------------------------------+
| Hồ sơ cá nhân                    [ Change password ] |
| user@example.com                                     |
|                                                       |
| Full name [______________]                           |
| Phone     [______________]                           |
| DOB       [______________]                           |
| Gender    [______________]                           |
| Address   [______________]                            |
|                                                       |
| [ Save changes ]                                     |
+----------------------------------------------------+
```

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Email + password → JWT pair |
| POST | `/api/auth/logout` | Authenticated | No server-side token invalidation; client drops the token |
| GET | `/api/auth/me` | Authenticated | Returns current user |
| PATCH | `/api/auth/me` | Authenticated | Self-edit profile fields (not email/role/password) |
| POST | `/api/auth/change-password` | Authenticated | Requires current password; clears `must_change_password` |
| POST | `/api/password-reset-requests` | Public | By email; always `204` (no user enumeration). Only matches active Teacher/Student. No-op if already pending. |
| GET | `/api/password-reset-requests` | Admin | List pending requests |
| POST | `/api/password-reset-requests/{id}/resolve` | Admin | Sets a temp password, `must_change_password=true`, marks request `RESOLVED` |
| GET | `/api/users` | Admin | List active Teacher/Student; `?q=` name/email search, `?role=TEACHER\|STUDENT` filter |
| POST | `/api/users` | Admin | Create account |
| PATCH | `/api/users/{id}` | Admin | Update account fields |
| DELETE | `/api/users/{id}` | Admin | Soft-deactivate (`is_active=false`); `422` if tied to an active Class |

## 4. DB

**`users`** (custom `AbstractUser`, `email` is `USERNAME_FIELD`)

| Field | Notes |
|---|---|
| `email` | unique |
| `password` | Django hash (never stored/logged raw) |
| `role` | `ADMIN` \| `TEACHER` \| `STUDENT` |
| `full_name`, `phone`, `date_of_birth`, `gender`, `address` | nullable profile fields |
| `must_change_password` | forces `/change-password` flow |
| `is_active` | soft-deactivation flag |

**`password_reset_requests`**

| Field | Notes |
|---|---|
| `user_id` | FK → users |
| `status` | `PENDING` \| `RESOLVED` |
| `resolver_id` | admin who resolved it |
| Constraint | unique `(user)` where `status = PENDING` — at most one open request per user |

## 5. Key functions / rules

- `accounts/views.py::IsAdmin` — role check that also blocks any admin whose own `must_change_password` is still true.
- `UsersView.delete` (deactivate) — checks `user.classes.filter(ends_at__gt=now)` (owns an active Class as teacher) and `user.enrollments.filter(classroom__ends_at__gt=now)` (enrolled in one as student); `422` if either is non-empty.
- `account_metadata(user)` — builds the audit metadata dict for account writes; excludes `password`.
- Every mutating account view wraps its write in `transaction.atomic()` + `write_audit(...)` (see [08-audit-log](08-audit-log.md)).
- Password-reset request creation is deliberately silent about whether the email exists (`204` either way) to avoid account enumeration.

## 6. Edge cases

- Resolving an already-`RESOLVED` request → `422`.
- Reset request for an unknown/inactive/`ADMIN` email → still `204`, nothing created.
- Editing/deactivating a `user_id` that is an Admin, or inactive → `404` (queryset is scoped to active Teacher/Student only).
