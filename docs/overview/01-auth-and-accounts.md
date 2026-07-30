# Feature: Auth & Accounts

Part of [00-system-overview](00-system-overview.md). Backend app: `accounts/`. Frontend: `LoginPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `ChangePasswordPage`, `AdminUsersPage`, `AdminUserCreatePage`, `AdminUserViewPage`, `AdminUserEditPage`, `ProfilePage`, `ProfileEditPage`. Shared: `AccountForm` (profile fields + client-side rules), `AccountActions` (row action menu), `Field`/`Select`, `PasswordField` (show/hide toggle, used by every password input in this feature), `Dialog`, `Toast` (admin mutation feedback), `UserMenu` (header account dropdown — see 2.4).

## 1. Purpose

Admin-provisioned identity: no self-registration. Covers login, forced password change, self-service password reset via emailed link, and admin CRUD (create/view/edit/enable-disable/delete) on Teacher/Student accounts.

## 2. Screens (ASCII)

Shared form layout (`Field`/`Select`): label above the control, `*` on required labels, hint and inline error below it, `noValidate` forms (no native browser tooltips). Public screens (`.public-page`) center a single card of `min(100%, 27rem)`; signed-in screens stack cards inside the app shell.

### 2.1 Login (`/login`)

```
+--------------------------------------------------+
|  Sign in                                         |
|                                                  |
|  (!) Your password has been reset. Sign in with  |   <- only ?reset=success
|      your new password.                          |      (or the sign-in failure text)
|                                                  |
|  Email *                                         |
|  [__________________________________]            |
|                                                  |
|  Password *                                      |
|  [____________________________] [ 0- ]           |   <- show/hide toggle
|                                                  |
|  [               Sign in               ]         |
|                                                  |
|  Forgot password?                                |
+--------------------------------------------------+
```
- "Forgot password?" is a link → `/forgot-password` (own page, not an inline toggle).
- Password field carries a show/hide button (`aria-label` `Show password` / `Hide password`); `Sign in` is a full-width block button.
- Empty email/password are caught client-side (`Email is required.` / `Password is required.`); a rejected login shows the server message as an alert above the fields.
- On success: redirect to `roleHome()` (currently `/dashboard` for every role).
- On `must_change_password = true`: redirected to `/change-password` instead.

### 2.1.a Forgot password (`/forgot-password`)

```
+--------------------------------------------------+
|  Forgot password                                 |
|  Enter your email, we'll send a reset link.      |
|                                                  |
|  (!) If an account exists for that email, we     |   <- after submit, always
|      sent a reset link.                          |
|                                                  |
|  Email *                                         |
|  [__________________________________]            |
|                                                  |
|  [           Send reset link           ]         |
|                                                  |
|  <- Back to sign in                              |
+--------------------------------------------------+
```
- Always shows the same generic notice regardless of whether the email matches an account, and regardless of whether the request was rate-limited or failed (no user enumeration).
- On submit, backend generates a reset token and emails a link: `{FRONTEND_URL}/reset-password?token=...`.

### 2.1.b Reset password (`/reset-password?token=...`)

Preflight runs on mount, so the screen has three states.

```
Checking                          Unusable link
+------------------------------+  +----------------------------------------+
|  Reset password              |  |  Reset password                        |
|  Checking reset link...      |  |  (!) This reset link is invalid or has |
+------------------------------+  |      expired.                          |
                                  |  Request a new reset link              |
                                  +----------------------------------------+

Usable link
+--------------------------------------------------+
|  Reset password                                  |
|                                                  |
|  New password *                                  |
|  [__________________________________]            |
|  At least 8 characters.                          |
|                                                  |
|  Confirm new password *                          |
|  [__________________________________]            |
|                                                  |
|  [           Reset password            ]         |
+--------------------------------------------------+
```
- Missing token → unusable state without any request. Otherwise `GET /api/auth/reset-password/{token}`: `204` renders the form, anything else renders the unusable state with a link to `/forgot-password`.
- `New password` and `Confirm new password` (and every other password field in this feature — Change password, admin Set password, admin Create User) render via the shared `PasswordField`, so all of them carry the same show/hide toggle as Login, not just the login field.
- `New password` and `Confirm new password` must match (client + server validation). A `422` on submit stays on the form and shows inline field errors; any other failure flips to the unusable state.
- On success: token is invalidated, redirect to `/login?reset=success`, which renders the success notice.

### 2.2 Change password (`/change-password`)

```
Forced (must_change_password)             Voluntary (from Profile / header menu)
+--------------------------------------------------+  +--------------------------------------------------+
|  Change password                                 |  |  Change password                     [ Back ]    |
|  Set a new password to continue.                 |  +--------------------------------------------------+
|                                                  |  |  Current password *                              |
|  Current password *                              |  |  [__________________________________]            |
|  [__________________________________]            |  |                                                  |
|                                                  |  |  New password *                                  |
|  New password *                                  |  |  [__________________________________]            |
|  [__________________________________]            |  |  At least 8 characters.                          |
|  At least 8 characters.                          |  |                                                  |
|                                                  |  |  Confirm new password *                           |
|  Confirm new password *                          |  |  [__________________________________]            |
|  [__________________________________]            |  |                                                  |
|                                                  |  |  [ Continue ]                                     |
|  [ Continue ]                                    |  +--------------------------------------------------+
+--------------------------------------------------+
```
- One screen for both entry points: the forced redirect after login and the `Change password` link on `/profile`/header account menu (2.4). The field is labelled `Current password` in both cases (it is the temporary password in the forced case).
- The screen renders inside the signed-in app shell (sidebar + header) for both cases — including the forced one, so a mid-forced-flow user still sees normal navigation chrome, not a bare public card. Only the voluntary case shows the `Back` button (`navigate(-1)`); the forced case shows the "Set a new password to continue." notice instead.
- `New password` and `Confirm new password` must match. All three fields carry the show/hide toggle (`PasswordField`).
- `Continue` → `POST /api/auth/change-password`, clears `must_change_password`, then redirects to `roleHome()` if this was the forced flow, or back to `/profile` if it was the voluntary one.

### 2.3 Admin — Accounts (`/admin/users`)

```
+-------------------------------------------------------------------------------------------------+
| Accounts                                                                        [ Create User ] |
| Manage Teacher and Student access.                                                              |
+-------------------------------------------------------------------------------------------------+
| Search accounts                       Role                                                      |
| [ Name, email or phone____________]   ( All  v )                                   [ Search ]   |
|                                                                                                 |
| Created from      Created to       Updated from      Updated to                                 |
| [ dd/mm/yyyy ]    [ dd/mm/yyyy ]   [ dd/mm/yyyy ]    [ dd/mm/yyyy ]                             |
+-------------------------------------------------------------------------------------------------+
| Email         | Full name    | Phone      | Created    | Updated    | Role    | Status   | Action |
| a@example.com | Nguyen Van A | 0912345678 | 05/01/2026 | 01/06/2026 | Teacher | (Active) |   :    |
| b@example.com | Tran Thi B   | --         | 10/02/2026 | 10/02/2026 | Student |(Disabled)|   :    |
+-------------------------------------------------------------------------------------------------+
|                            [ Previous ]    Page 1    [ Next ]                                   |
+-------------------------------------------------------------------------------------------------+

Row action menu (the ":" trigger)      Set password dialog
+---------------------+                +------------------------------------------+
| View                |                | Change password                          |
| Change password     |                | Choose a new password for                |
| Disable  / Enable   |                | a@example.com. The user will need it     |
| Delete              |                | to sign in.                              |
+---------------------+                |                                          |
                                       | New password *                           |
                                       | [______________________] [ 0- ]          |
                                       | At least 8 characters.                   |
                                       |                                          |
                                       | Confirm new password *                   |
                                       | [______________________] [ 0- ]          |
                                       |                                          |
                                       |                [ Cancel ] [ Set password ]|
                                       +------------------------------------------+
```
- Filters are a draft: typing changes nothing. `[ Search ]` (form submit) applies Search + Role + the four date filters at once and resets to page 1. Out-of-order responses are discarded, so a slow earlier request never overwrites a newer list.
- Table columns: Email, Full name, Phone, Created (`created_at`), Updated (`updated_at`), Role, Status (`Active`/`Disabled` badge), Action. Empty values render `—`; dates render `en-GB` (`dd/mm/yyyy`).
- Paginated, 10 accounts/page, `Previous` / `Page N` / `Next` (no numbered page links). Empty result → `No accounts found.`; load failure → alert with `Retry`.
- Actions live in a per-row `:` menu (`role="menu"`, arrow-key navigation, `Escape`/outside click closes). The panel renders in a portal positioned against the trigger button, flipping to open upward when there isn't room below (e.g. last rows on a page) — same items and keyboard behavior either way:
  - `View` → `/admin/users/{id}` (read-only). **`Edit` is reached from there**, not from this menu.
  - `Change password` → dialog above (titled "Change password", body names the target email); **admin types the value themselves**, nothing is generated server-side and nothing is emailed (admin is top-level privilege, and the whole point is that they can read it out to the user). Client-side rules: at least 8 characters and both fields equal. Sets `must_change_password = true`, so the value the admin picked survives exactly one login. `Cancel` closes without saving. On success, a toast confirms ("Password updated for {email}."); on failure, both the inline field errors and an error toast show.
  - `Disable` / `Enable` → confirm dialog (`Disable access for {email}?`) with `Cancel` / confirm buttons, toggles `is_active`. Disabling blocked (`422`) if tied to an active Class; the dialog shows the server message. On success, a toast confirms (warning-styled for Disable, success-styled for Enable).
  - `Delete` → confirm dialog (`This permanently hides {email} from the accounts list.`) with `Cancel` / confirm buttons, soft-deletes (`is_deleted = true`). Blocked (`422`) if the account owns/is enrolled in an active Class (same check as Disable). One-way — no restore/undelete action. On success, a warning-styled toast confirms the deletion.
- `Create User` → `/admin/users/new` (own page, see 2.3.a — not a dialog).
- List/View/Edit scope: active Teacher/Student **and** disabled Teacher/Student (so admin can re-enable them). `is_deleted = true` rows are always excluded — never shown anywhere in this list, regardless of filters/pagination.

### 2.3.a Admin — Create User (`/admin/users/new`)

```
+-------------------------------------------------------------------+
| Create User                                                       |
+-------------------------------------------------------------------+
| Account access                                                    |
|   Email *                        Role *                           |
|   [______________________]       ( Teacher v )                    |
|   Initial password *                                              |
|   [______________________]                                        |
|   At least 8 characters.                                          |
|                                                                   |
| Personal information                                              |
|   Full name *                    Phone                            |
|   [______________________]       [______________________]         |
|                                  9 to 15 digits, optional +.      |
|   Date of birth                  Gender                           |
|   [ dd/mm/yyyy ]                 ( Not provided v )               |
|                                                                   |
| Location                                                          |
|   Hometown                                                        |
|   [______________________]                                        |
|   Address                                                         |
|   [_____________________________________________________]        |
|                                                                   |
| [ Create ]   Cancel                                               |
+-------------------------------------------------------------------+
```
- Three `fieldset`s: Account access (Email, Role, Initial password), Personal information, Location. The last two come from the shared `AccountForm`, so admin create/edit and self-edit cannot drift apart. `Initial password` uses `PasswordField`, same show/hide toggle as every other password input.
- Client-side rules mirror the serializers: email shape, password ≥ 8 chars, full name 2–100 chars, phone `^\+?\d{9,15}$`, date of birth strictly in the past (`max` = today), hometown ≤ 100, address ≤ 255. Server `422` field errors land on the same fields.
- Gender options: `Not provided` (null) / `Male` (`NAM`) / `Female` (`NU`) / `Other` (`KHAC`).
- On success → back to `/admin/users`. `Cancel` is a link to the list. New accounts get `must_change_password = true`.

### 2.3.b Admin — User Detail (`/admin/users/{id}`) and Edit (`/admin/users/{id}/edit`)

```
User Detail                                        Edit User
+---------------------------------------------+    +---------------------------------------------+
| User Detail                   [ Edit User ] |    | Edit User                                   |
+---------------------------------------------+    +---------------------------------------------+
| Account access                              |    | Account access            (read-only)       |
|   Email  : a@example.com                    |    |   Email  : a@example.com                    |
|   Role   : Teacher                          |    |   Role   : Teacher                          |
|   Status : (Active)                         |    |   Status : (Active)                         |
+---------------------------------------------+    +---------------------------------------------+
| Personal information                        |    | Personal information                        |
|   Full name / Phone / Date of birth / Gender|    |   [ same fields as 2.3.a ]                   |
+---------------------------------------------+    | Location                                    |
| Location                                    |    |   [ Hometown / Address ]                     |
|   Hometown / Address                        |    |                                             |
+---------------------------------------------+    | [ Save changes ]   Cancel                   |
| Record                                      |    +---------------------------------------------+
|   Created / Last updated                    |
+---------------------------------------------+
| Back to accounts                            |
+---------------------------------------------+
```
- Email, Role and Status are never editable here: Role/Email have no update path, and Status is changed from the list's action menu.
- Edit `Cancel` → `/admin/users/{id}`; a successful save → `/admin/users/{id}`.
- Unknown/Admin/`is_deleted` id → `404` → `Account not found.` alert.

### 2.4 Profile (`/profile`, all roles)

View (`/profile`):
```
+---------------------------------------------------------------+
| Profile                        Change password [ Edit profile ]|
+---------------------------------------------------------------+
| Account access                                                |
|   Email : user@example.com                                    |
|   Role  : Teacher                                             |
+---------------------------------------------------------------+
| Personal information                                          |
|   Full name     : ...                                         |
|   Phone         : ...                                         |
|   Date of birth : ...                                         |
|   Gender        : ...                                         |
+---------------------------------------------------------------+
| Location                                                      |
|   Hometown : ...                                              |
|   Address  : ...                                              |
+---------------------------------------------------------------+
```

Edit (`/profile/edit`):
```
+---------------------------------------------------------------+
| Edit profile                                                  |
+---------------------------------------------------------------+
| Personal information                                          |
|   Full name *      Phone                                      |
|   Date of birth    Gender                                     |
| Location                                                      |
|   Hometown                                                    |
|   Address                                                     |
|                                                               |
| [ Save changes ]   Cancel                                     |
+---------------------------------------------------------------+
```
- Same `AccountForm` (and same client-side rules) as the admin create/edit screens; email and role are read-only and only shown on the View screen.
- `Change password` link → `/change-password` (authenticated, requires current password — `POST /api/auth/change-password`). Different trigger than the forced 2.2 flow, same screen and same API.
- Save → `PATCH /api/auth/me`, refresh the cached user, back to `/profile`.
- The app header's account menu (`UserMenu`, every authenticated screen) gives a second path to the same two destinations plus sign-out: `Profile` → `/profile`, `Change password` → `/change-password`, `Log out` → same client-side logout as before, now behind a dropdown instead of a bare `Sign out` button.

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Email + password → `{ access_token, user }` |
| POST | `/api/auth/logout` | Authenticated | No server-side token invalidation; client drops the token |
| GET | `/api/auth/me` | Authenticated | Returns current user |
| PATCH | `/api/auth/me` | Authenticated | Self-edit profile fields (not email/role/password) |
| POST | `/api/auth/change-password` | Authenticated | Requires current password; clears `must_change_password` |
| POST | `/api/auth/forgot-password` | Public | By email; always `204` (no user enumeration). Generates a reset token and emails a link. |
| GET | `/api/auth/reset-password/{token}` | Public | Preflight before rendering the form: `204` usable, `404` unknown token, `410` used/expired |
| POST | `/api/auth/reset-password` | Public | `{ token, new_password, confirm_new_password }` → sets password, invalidates the token. `404` unknown, `410` used/expired, `422` password rules/mismatch |
| GET | `/api/users` | Admin | List Teacher/Student (active + disabled, excludes `is_deleted`); `?q=` name/email, `?role=TEACHER\|STUDENT`, `?created_from=&created_to=`, `?updated_from=&updated_to=`, `?page=` (10/page) |
| GET | `/api/users/{id}` | Admin | Single account detail (View/Edit screens) |
| POST | `/api/users` | Admin | Create account; sets `must_change_password = true` |
| PATCH | `/api/users/{id}` | Admin | Update profile fields only; any other key → `422` |
| PATCH | `/api/users/{id}/status` | Admin | Toggle `is_active` (Enable/Disable); `422` if disabling and tied to an active Class, or if the status is unchanged |
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
| `full_name`, `phone`, `date_of_birth`, `gender`, `hometown`, `address` | nullable profile fields. `gender` stores `NAM`/`NU`/`KHAC` and is rendered as Male/Female/Other. `hometown` (tỉnh/thành) is shown as "Quê quán" on the admin Class roster — see [02](02-classes-and-enrollment.md) |
| `must_change_password` | forces `/change-password` flow |
| `is_active` | enable/disable flag (reversible, blocks login) |
| `is_deleted` | soft-delete flag, set by admin `Delete`; excluded from all admin list/view/edit querysets |

**`password_reset_tokens`** (replaces `password_reset_requests`)

| Field | Notes |
|---|---|
| `user_id` | FK → users |
| `token_hash` | `sha256` of the token; raw token only ever exists in the emailed link |
| `expires_at` | `created_at + 30min` |
| `used_at` | null until consumed; a token is valid only if `used_at is null and now < expires_at` |

## 5. Key functions / rules

- `accounts/permissions.py::IsAdmin` — role check that also blocks any admin whose own `must_change_password` is still true. `accounts/permissions.py::IsAuthenticated` blocks every endpoint except `/api/auth/me`, `/api/auth/change-password` and `/api/auth/logout` while `must_change_password` is set.
- `UserDetailView.delete` (soft-delete) — `has_active_class(user)` checks `Class(teacher=user, is_active=True, ends_at__gt=now)` and `Enrollment(student=user, classroom__is_active=True, classroom__ends_at__gt=now)`; `422` if either matches, else sets `is_deleted = true`. Same check as the disable toggle. No restore path. ("Active Class" = `is_active` **and** not yet ended — a disabled or ended Class never blocks an account operation; see [02](02-classes-and-enrollment.md).)
- `UserStatusView.patch` — same active-Class check when disabling (`is_active → false`); no check when enabling; `422` when the requested status equals the current one.
- `account_metadata(user)` — builds the audit metadata dict for account writes; excludes `password`.
- Every mutating account view wraps its write in `transaction.atomic()` + `write_audit(...)` (see [08-audit-log](08-audit-log.md)). Actions this app writes: `account.created`, `account.updated` (admin edit), `account.self_updated` (`PATCH /api/auth/me`), `account.deactivated` / `account.reactivated` (the status toggle, one action each way), `account.deleted` (soft-delete), `account.password_changed` (user changes their own — both the forced flow and the emailed-link reset), `account.password_set` (admin sets someone else's). Login, logout and `forgot-password` write nothing: they are not domain writes, and auditing failed logins would be a security feature nobody asked for.
- Forgot-password is deliberately silent about whether the email exists (`204` either way) to avoid account enumeration. It only issues a token for an `is_active`, not deleted Teacher/Student — never for `ADMIN`.
- `issue_reset_token` invalidates (`used_at = now`) any prior unused, unexpired token for that user before issuing a new one — only the newest link works. Raw token is `secrets.token_urlsafe(32)`; only its `sha256` is stored.
- `POST /api/auth/forgot-password` is rate-limited by `accounts/throttling.py` on top of the Django cache (no third-party dependency): max 1 request/min per email, max 5 requests/hour per IP. Rate-limited requests still return `204` — no signal leaked, and no email is sent.
- Email sending is mocked via Django's console email backend (`EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'`) — prints to server stdout/log, never returned in the API response. The printed MIME body is quoted-printable and soft-wrapped at 76 columns, which splits the link mid-token, so `accounts/mail.py` also prints a plain `[dev] password reset link for <email>: <link>` line when `DEBUG` is on — **copy that line, not the one inside the mail body**. Real mail clients decode quoted-printable, so production links are unaffected. Swapping to real SMTP later is a settings-only change.

## 6. Edge cases

- Reset link missing/invalid/expired/already used → the unusable state on the reset-password screen with a link back to `/forgot-password`; user must request a new one.
- Reset link that fails the preflight but is submitted anyway (or expires between preflight and submit) → `404`/`410` → the screen flips to the unusable state; password-rule failures return `422` and stay on the form.
- Forgot-password for an unknown/inactive/deleted/`ADMIN` email → still `204`, nothing created (no enumeration).
- Viewing/editing/deleting/toggling a `user_id` that is Admin or `is_deleted` → `404` (queryset excludes them).
- A disabled (`is_active=false`) Teacher/Student is still visible/viewable/editable by admin, so it can be re-enabled.
- Rate-limited `forgot-password` requests → still `204`, no email sent (so no new link appears in the server log — an old link that was already invalidated stays invalid).
- Slow account-list responses arriving after a newer filter/page request are dropped instead of overwriting the current list.

## 7. Where the build differs from the original design

Implementation is the source of truth; these are the deliberate deviations from the first sketch of this doc.

| Original design | Built |
|---|---|
| Row actions `View Edit Delete Đổi MK Bật/Tắt` as inline buttons | A per-row `:` menu with `View`, `Change password`, `Disable`/`Enable`, `Delete`. **No `Edit`** — Edit is reached from the User Detail screen |
| Create account in a dialog | Own page `/admin/users/new` (`Create User`), same shared form as Edit |
| Numbered pagination `< 1 2 3 ... >` | `Previous` / `Page N` / `Next` |
| No Status column | `Status` column with an `Active`/`Disabled` badge (the design carried status only in the action label) |
| Vietnamese column/field labels (`Ngày tạo`, `Ngày update`, `Quê quán`, `Hồ sơ cá nhân`) | English UI labels (`Created`, `Updated`, `Hometown`, `Profile`); dates render `dd/mm/yyyy` |
| Change-password field labelled `Temporary password` in the forced flow | `Current password` in both flows — one screen, one API |
| Reset screen has form or error | Third state: `Checking reset link…` while the preflight runs |
| Login password is a plain field, `Sign in` centered | Password has a show/hide toggle; `Sign in` is a full-width block button |
| `Gender` as a free text field | `Select` with `Not provided` / `Male` / `Female` / `Other` (`NAM`/`NU`/`KHAC`) |
| `roleHome(role)` per-role landing | `roleHome()` — every role lands on `/dashboard` for now |
| Rate limiting "via `django-ratelimit`" | Hand-rolled `accounts/throttling.py` over the Django cache; no extra dependency |
| `IsAdmin` in `accounts/views.py` | `accounts/permissions.py` |
| Reusing a used/expired token → `422`/`410` | `410` used/expired, `404` unknown token; `422` is only for password rules |
| Header `Sign out` button | Header `UserMenu` dropdown: `Profile` / `Change password` / `Log out` |
| Admin "Set password" dialog with no confirm/cancel escape | Retitled `Change password`, adds a `Cancel` button next to `Set password`, and admin mutations (set password, disable/enable, delete) confirm or fail via a toast, not just inline text |
| One `/change-password` layout for both entry points | Still one screen/API, but now rendered inside the signed-in app shell for both the forced and voluntary case, with only the voluntary case getting a `Back` button; voluntary submit returns to `/profile` instead of `roleHome()` |

Known gap: the account search box is placeholdered `Name, email or phone`, but `GET /api/users?q=` matches `full_name` and `email` only — phone is not searchable yet.
