# Authentication and Account Administration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sessions, route access, responsive navigation, and Admin management of active Teacher/Student accounts correct and usable.

**Architecture:** Expand the existing `accounts.User` profile and make `accounts` own login/logout and account rules. The frontend gets one session-aware API wrapper and one role-aware application shell; pages use those instead of each implementing `/auth/me` checks and navigation.

**Tech Stack:** Django, DRF, SimpleJWT, React, TypeScript, Vitest.

## Global Constraints

- Only active `TEACHER` and `STUDENT` accounts are administrable; `ADMIN` is never returned by `/users` or accepted by account mutations.
- JWT signing key is generated at process startup; tokens must fail after restart.
- No dependency additions; use browser `sessionStorage`, `URLSearchParams`, CSS, and existing React APIs.

---

### Task 1: Define account profile persistence and serializer rules

**Files:**
- Modify: `backend/accounts/models.py`, `backend/accounts/serializers.py`
- Create: `backend/accounts/migrations/0003_user_profile.py`
- Test: `backend/accounts/tests/test_accounts.py`

**Consumes:** existing `User` identity and role values. **Produces:** `User.full_name`, `phone`, `date_of_birth`, `gender`, account create/update payloads, and public user output with profile fields.

- [ ] **Step 1: Add failing serializer tests for the boundary values and forbidden Admin account payloads.**

```python
response = self.admin_client.post("/api/users", {"full_name": " A ", "email": "A@EXAMPLE.TEST", "password": "password1", "role": "ADMIN"})
self.assertEqual(response.status_code, 422)
```

- [ ] **Step 2: Run `cd backend; python manage.py test accounts.tests.test_accounts -v 2` and confirm the new assertions fail.**

- [ ] **Step 3: Add nullable profile fields and serializers that trim full name/address, lowercase email, validate phone/date/gender, expose only active Teacher/Student records, and accept only mutable profile fields plus `new_password` on PATCH.**

```python
class UserUpdateSerializer(serializers.ModelSerializer):
    new_password = serializers.CharField(write_only=True, required=False, min_length=8, max_length=128)
```

- [ ] **Step 4: Make and inspect migration `0003_user_profile.py`; run the same backend test command and confirm PASS.**

- [ ] **Step 5: Commit.**

```bash
git add backend/accounts && git commit -m "feat: add account profile validation"
```

### Task 2: Enforce account, login, logout, and audit behavior in the API

**Files:**
- Modify: `backend/config/settings.py`, `backend/accounts/views.py`, `backend/accounts/urls.py`, `backend/accounts/tests/test_accounts.py`

**Consumes:** Task 1 serializers. **Produces:** `POST /auth/login` returning `{access_token, user}`, `POST /auth/logout` returning `204`, and Admin-only `/users` CRUD behavior.

- [ ] **Step 1: Add failing API tests for inactive login, logout, `GET /users?q=&role=`, Admin target rejection, PATCH password reset, and DELETE soft-deactivation/audit.**

```python
response = self.admin_client.delete(f"/api/users/{self.student.id}")
self.assertEqual(response.status_code, 204)
self.assertFalse(User.objects.get(id=self.student.id).is_active)
self.assertEqual(AuditLog.objects.get().action, "account.deactivated")
```

- [ ] **Step 2: Run the account test module and confirm failures.**

- [ ] **Step 3: Generate a module-level `secrets.token_urlsafe(64)` signing key in settings, configure SimpleJWT to use it, subclass token login to reject inactive users and return the access token plus serialized user, and add a token-authenticated logout view returning `204`.**

```python
JWT_SIGNING_KEY = secrets.token_urlsafe(64)
SIMPLE_JWT = {"SIGNING_KEY": JWT_SIGNING_KEY}
```

- [ ] **Step 4: Limit `UsersView` to Admin; filter `is_active=True`, optional case-insensitive `q`, and `TEACHER|STUDENT` role. Create/edit/deactivate through the validated serializers, update password with `set_password`, and call `write_audit` for each success.**

- [ ] **Step 5: Run `cd backend; python manage.py test accounts audit config -v 2` and confirm PASS. Commit.**

```bash
git add backend/config backend/accounts && git commit -m "feat: secure account administration sessions"
```

### Task 3: Centralize frontend session expiry and role routing

**Files:**
- Modify: `frontend/src/api.ts`, `frontend/src/auth.tsx`, `frontend/src/main.tsx`, `frontend/src/api.test.ts`, `frontend/src/auth.test.ts`
- Create: `frontend/src/session.ts`, `frontend/src/session.test.ts`, `frontend/src/AppShell.tsx`

**Consumes:** Task 2 auth responses. **Produces:** `currentUser()`, `clearSession()`, `requireRole()`, a single 401 redirect path, and exact public/protected route handling.

- [ ] **Step 1: Add a failing Vitest test that a 401 clears `accessToken` once and assigns `/login`; add router tests for unknown, missing-session, and wrong-role paths.**

```ts
await expect(api("/auth/me")).rejects.toMatchObject({ status: 401 });
expect(sessionStorage.getItem("accessToken")).toBeNull();
expect(location.assign).toHaveBeenCalledWith("/login");
```

- [ ] **Step 2: Run `cd frontend; npm test -- --runInBand` and confirm the tests fail.**

- [ ] **Step 3: Replace the login two-request flow with the Task 2 response, put token/user reads and cleanup in `session.ts`, and make `api` parse empty `204` responses plus invoke one injected 401 handler.**

- [ ] **Step 4: Replace pathname ternaries with an explicit route table for the spec routes, validate the stored session through `/auth/me` before rendering a protected page, and redirect every mismatch or unknown route to `/login`.**

- [ ] **Step 5: Run `cd frontend; npm test; npm run build` and confirm PASS. Commit.**

```bash
git add frontend/src && git commit -m "feat: centralize session and route protection"
```

### Task 4: Build the shared responsive shell and Admin account page

**Files:**
- Modify: `frontend/src/styles.css`, `frontend/src/pages/AdminUsersPage.tsx`, `frontend/src/pages/AuditLogPage.tsx`
- Create: `frontend/src/pages/AdminUsersPage.test.tsx`

**Consumes:** Tasks 1-3 APIs and shell. **Produces:** desktop sidebar/mobile scrollable navigation with final Logout action, debounced/filterable active account list, and create/edit modal.

- [ ] **Step 1: Add a failing component test that waits 300 ms before querying, verifies role filters exclude Admin, and verifies deactivation removes the row.**

```ts
await user.type(screen.getByLabelText("Search accounts"), "an@example.test");
await vi.advanceTimersByTimeAsync(300);
expect(api).toHaveBeenLastCalledWith("/users?q=an%40example.test&role=");
```

- [ ] **Step 2: Run `cd frontend; npm test` and confirm failure.**

- [ ] **Step 3: Have `AppShell` render role navigation and a logout button that calls `/auth/logout` but clears and redirects in `finally`; use it for both Admin pages.**

- [ ] **Step 4: Replace inline editable account table with a filtered list and one modal: Create allows Teacher/Student role and password; Edit displays immutable email/role and optional blank New Password. Use `window.confirm` for deactivation and remove the successful row locally.**

- [ ] **Step 5: Add CSS grid/flex constraints for 320px, use horizontal navigation only below the breakpoint, run `npm test; npm run build`, and commit.**

```bash
git add frontend/src && git commit -m "feat: redesign admin account management"
```

## Feature Gate

`python manage.py test accounts audit config`, `npm test`, and `npm run build` pass. An Admin can create, edit, reset, and deactivate only active Teacher/Student accounts; logout and every invalid route/session end at `/login`.
