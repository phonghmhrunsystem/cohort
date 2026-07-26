# Phase 01 — Identity and Administrator Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the custom user model, JWT authentication, administrator-only account management, and append-only audit foundation.

**Architecture:** `accounts` owns identity and role checks; `audit` owns the append-only model and a small writer used by domain services. Configure the custom user model before any migration.

**Tech Stack:** Django auth, Django REST Framework, SimpleJWT, SQLite.

## Global Constraints

- `email` is unique and is the login identity.
- Roles are `ADMIN`, `TEACHER`, `STUDENT`; inactive users cannot receive a token.
- Account mutations create an audit record without secrets.

### Task 1: Implement custom user, JWT, and current-user API

**Files:**
- Create: `backend/accounts/models.py`, `backend/accounts/managers.py`, `backend/accounts/serializers.py`, `backend/accounts/views.py`, `backend/accounts/urls.py`, `backend/accounts/tests/test_auth.py`
- Modify: `backend/config/settings.py`, `backend/config/urls.py`

**Interfaces:**
- Produces: `User(email, role, is_active)`, `POST /api/auth/login/`, `GET /api/auth/me/`.

- [ ] **Step 1: Write failing authentication tests**

```python
def test_inactive_user_cannot_log_in(self):
    user = User.objects.create_user('student@example.test', 'secret', role='STUDENT', is_active=False)
    response = self.client.post('/api/auth/login/', {'email': user.email, 'password': 'secret'})
    self.assertEqual(response.status_code, 401)

def test_me_returns_authenticated_role(self):
    self.client.force_authenticate(self.student)
    self.assertEqual(self.client.get('/api/auth/me/').data['role'], 'STUDENT')
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend; python manage.py test accounts.tests.test_auth -v 2`

- [ ] **Step 3: Implement `User`, configure `AUTH_USER_MODEL`, SimpleJWT serializer/login view, and `/auth/me`**
- [ ] **Step 4: Create and apply the initial migration**

Run: `cd backend; python manage.py makemigrations accounts; python manage.py migrate`

- [ ] **Step 5: Re-run the focused tests**
- [ ] **Step 6: Commit**

```bash
git add backend/accounts backend/config
git commit -m "feat: add JWT identity and role model"
```

### Task 2: Implement audit writer and administrator account API

**Files:**
- Create: `backend/audit/models.py`, `backend/audit/services.py`, `backend/audit/serializers.py`, `backend/audit/views.py`, `backend/audit/urls.py`, `backend/audit/tests/test_accounts_audit.py`
- Modify: `backend/accounts/serializers.py`, `backend/accounts/views.py`, `backend/config/urls.py`

**Interfaces:**
- Consumes: authenticated `User`.
- Produces: `append_audit(*, actor, action, target, metadata)`, `GET/POST /api/users/`, `PATCH /api/users/{id}/`, `GET /api/audit-logs/`.

- [ ] **Step 1: Write failing API tests for admin-only create/deactivate and audit content**

```python
def test_admin_creates_user_and_audit_has_no_password(self):
    self.client.force_authenticate(self.admin)
    response = self.client.post('/api/users/', {'email': 'teacher@example.test', 'password': 'secret', 'role': 'TEACHER'})
    self.assertEqual(response.status_code, 201)
    self.assertNotIn('secret', str(AuditLog.objects.get()))

def test_teacher_cannot_list_users(self):
    self.client.force_authenticate(self.teacher)
    self.assertEqual(self.client.get('/api/users/').status_code, 403)
```

- [ ] **Step 2: Run focused tests and verify failure**
- [ ] **Step 3: Implement `AuditLog`, append-only writer, admin permission, account serializers/views, and audit list**
- [ ] **Step 4: Make and apply migrations; rerun the focused tests**
- [ ] **Step 5: Commit**

```bash
git add backend/accounts backend/audit backend/config
git commit -m "feat: add administrator accounts and audit log"
```

