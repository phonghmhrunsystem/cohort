# Personal Profile and Class Teacher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teacher/Student tự cập nhật profile/đổi mật khẩu và Student thấy Teacher của Class đang enrolled.

**Architecture:** Account owns own-profile/password endpoints; Class serializer exposes teacher profile only through scoped class lookup. React adds one Profile page without Admin-user mutation reuse.

**Tech Stack:** Django, DRF, React, TypeScript, Vitest.

## Global Constraints

- Email, role, active state và password không được PATCH `/auth/me`.
- Change password needs current password and policy 8–128; wrong password returns `422` without hash change.
- Không có arbitrary public user profile endpoint.

---

### Task 1: Self profile and password API

**Files:** Modify `backend/accounts/{serializers,views,urls}.py`, account tests.

**Produces:** `PATCH /auth/me`, `POST /auth/change-password`.

- [ ] **Step 1: Write failing tests for valid save, forbidden field `422`, invalid phone/DOB fields, wrong current password/hash unchanged, safe audit.**

```python
response = self.student_client.post("/api/auth/change-password", {"current_password": "wrong", "new_password": "Password2!"})
self.assertEqual(response.status_code, 422)
self.assertTrue(self.student.check_password("Password1!"))
```

- [ ] **Step 2: Add `SelfProfileSerializer` and `ChangePasswordSerializer`; extend MeView PATCH and add change-password view with transaction/audit.**

- [ ] **Step 3: Run `cd backend; python manage.py test accounts -v 2`; commit `feat: add self-service profile endpoints`.**

### Task 2: Enrolled-class teacher contract

**Files:** Modify `backend/classes/{serializers,views}.py`, class tests, `frontend/src/classes.ts`.

- [ ] **Step 1: Write tests proving enrolled Student receives safe teacher details but different-class student cannot read Class B.**

- [ ] **Step 2: Add `teacher` nested display serializer to scoped Class response; only existing `get_scoped_class` determines visibility.**

- [ ] **Step 3: Run `cd backend; python manage.py test classes -v 2`; commit `feat: expose class teacher to enrolled students`.**

### Task 3: Profile and Student class UI

**Files:** Create `frontend/src/pages/ProfilePage.tsx` and test; modify `AppShell.tsx`, `main.tsx`, `StudentClassPage.tsx`, `auth.tsx`.

- [ ] **Step 1: Write tests for `/profile`, persisted profile refresh, field `422`, password dialog, and read-only Teacher card.**

- [ ] **Step 2: Add Teacher/Student nav link and role-compatible page map; form PATCHes profile, AppDialog POSTs password.**

```tsx
<a href="/profile">Hồ sơ cá nhân</a>
```

- [ ] **Step 3: Run `cd frontend; npm test; npm run build`; commit `feat: add personal profile screens`.**

## Feature Gate

User can only mutate self profile; Student sees only their enrolled Class teacher.

