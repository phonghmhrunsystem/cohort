# Phase 1 — Identity and Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the local app and let an Admin create, edit, activate/deactivate accounts with auditable changes.

**Architecture:** Create the custom Django user before first migration, use SimpleJWT for login/current-user, and keep account mutations plus their audit row in one transaction. The Vite UI has only login, Admin account list/form, and read-only audit list.

**Tech Stack:** Django, DRF, SimpleJWT, SQLite, React, Vite, TypeScript, Tailwind CSS.

## Global Constraints

- Roles: `ADMIN`, `TEACHER`, `STUDENT`; unique email; Django password hashing; inactive accounts cannot log in.
- API root is `/api`; protected endpoints use JWT Bearer tokens; use `401`, `403`, `404`, and `422` as defined in the spec.
- Audit records are append-only, Admin-readable only, and metadata excludes passwords/hashes, tokens, bytes, and absolute paths.

---

### Task 1: Bootstrap backend and frontend

**Files:**
- Create: `backend/requirements.txt`, `backend/manage.py`, `backend/config/settings.py`, `backend/config/urls.py`, `backend/config/asgi.py`, `backend/config/wsgi.py`
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/src/main.tsx`, `frontend/src/api.ts`, `frontend/src/styles.css`
- Create: `README.md`

**Produces:** `GET /api/health -> {"status":"ok"}` and `api<T>(path, options)` that sends the session token and throws `{status, detail}`.

- [x] **Step 1: Create Django settings with `USE_TZ=True`, `TIME_ZONE="UTC"`, SQLite, `MEDIA_ROOT`, `MAX_UPLOAD_BYTES=1073741824`, DRF, SimpleJWT, and `/api/` URL routing.**

```python
# config/urls.py
urlpatterns = [path("api/health", lambda request: JsonResponse({"status": "ok"}))]
```

- [x] **Step 2: Start Django and check `GET http://127.0.0.1:8000/api/health` returns `200`.**

Run: `cd backend; python manage.py runserver`

- [x] **Step 3: Create the Vite TypeScript app, proxy `/api` to port `8000`, and add its one typed API wrapper.**

```ts
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, options);
  if (!response.ok) throw { status: response.status, detail: (await response.json()).detail };
  return response.json() as Promise<T>;
}
```

- [x] **Step 4: Start Vite and verify the browser request to `/api/health` is `200`. Commit.**

```bash
git add backend frontend README.md
git commit -m "chore: bootstrap class management demo"
```

### Task 2: Add account identity and audit API

**Files:**
- Create: `backend/accounts/models.py`, `backend/accounts/serializers.py`, `backend/accounts/views.py`, `backend/accounts/urls.py`, `backend/accounts/tests/test_accounts.py`
- Create: `backend/audit/models.py`, `backend/audit/services.py`, `backend/audit/serializers.py`, `backend/audit/views.py`, `backend/audit/tests/test_audit.py`
- Modify: `backend/config/settings.py`, `backend/config/urls.py`

**Produces:** `POST /api/auth/login`, `GET /api/auth/me`, Admin `GET/POST /api/users`, `PATCH /api/users/{id}`, `GET /api/audit-logs`, and `write_audit(*, actor, action, target, metadata)`.

- [x] **Step 1: Write failing tests for inactive login and auditable account deactivation.**

```python
def test_inactive_user_cannot_obtain_token(self):
    user = User.objects.create_user("student@example.test", "pw", role="STUDENT", is_active=False)
    response = self.client.post("/api/auth/login", {"email": user.email, "password": "pw"})
    self.assertEqual(response.status_code, 401)

def test_account_change_writes_audit_row(self):
    self.admin_client.patch(f"/api/users/{self.student.id}", {"is_active": False})
    self.assertEqual(AuditLog.objects.get().action, "account.updated")
```

- [x] **Step 2: Run `cd backend; python manage.py test accounts.tests audit.tests`; expect failure because endpoints/models do not exist.**

- [x] **Step 3: Add the custom `User` before the first migration, JWT login/me, and Admin-only account views.**

```python
class User(AbstractUser):
    class Role(models.TextChoices): ADMIN = "ADMIN"; TEACHER = "TEACHER"; STUDENT = "STUDENT"
    username = None
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=7, choices=Role.choices)
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
```

- [x] **Step 4: Add append-only `AuditLog`; wrap every account create/update and `write_audit` in `transaction.atomic()`; allow only `email`, `role`, `is_active` in account audit metadata.**

- [x] **Step 5: Migrate and run the focused tests; expect PASS and no secret fields in audit metadata.**

Run: `cd backend; python manage.py makemigrations; python manage.py migrate; python manage.py test accounts.tests audit.tests`

### Task 3: Add Phase 1 UI and proof

**Files:**
- Create: `frontend/src/auth.tsx`, `frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/AdminUsersPage.tsx`, `frontend/src/pages/AuditLogPage.tsx`
- Modify: `frontend/src/main.tsx`

**Consumes:** the Task 2 identity/account/audit endpoints.

- [x] **Step 1: Implement Login storing only the access token in `sessionStorage`, then fetch `/auth/me` to route an Admin to `/admin/users`.**

```tsx
{user.role === "ADMIN" && <Navigate to="/admin/users" replace />}
```

- [x] **Step 2: Add labelled create/edit/active-state controls, loading/empty/error text, and a read-only audit table.**

- [x] **Step 3: Browser-check: Admin creates Teacher + Student, deactivates Student, sees both actions in audit, and Student login is rejected. Commit.**

```bash
git add backend frontend
git commit -m "feat: add identity and admin accounts"
```

## Phase Gate

Run: `cd backend; python manage.py test accounts.tests audit.tests`

Expected: PASS. Browser proof matches the Phase 1 demo proof. Stop and request authorization before Phase 2.
