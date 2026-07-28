# Password Recovery, Notifications, and Class Resources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset mật khẩu nội bộ qua Admin, notification trong app và link tài liệu lớp.

**Architecture:** Reset request thuộc `accounts`; notification cross-domain là app `notifications`; link resource thuộc `classes`. Không gửi email, không upload resource, không scheduler.

**Tech Stack:** Django, DRF, React, TypeScript, Vitest.

## Global Constraints

- Reset request luôn trả `204`; chỉ active Teacher/Student không pending mới tạo row.
- Admin resolve atomically sets temporary password + `must_change_password`; user bị giới hạn tới change-password.
- Assignment/resource creation creates notification for current enrolled Students only; URL resource absolute `https://`.

---

### Task 1: Password reset request and force-change gate

**Files:** Create account migration; modify `backend/accounts/{models,serializers,views,urls}.py`, tests, `LoginPage.tsx`, `main.tsx`; create reset-admin page/tests.

- [ ] **Step 1: Write tests for unknown/inactive/Admin 204/no row, one pending request, Admin-only resolve, double resolve 422, force-change restriction.**

```python
response = self.client.post("/api/password-reset-requests", {"email": "none@example.test"})
self.assertEqual(response.status_code, 204)
self.assertFalse(PasswordResetRequest.objects.exists())
```

- [ ] **Step 2: Add `PasswordResetRequest`, `User.must_change_password`, request/list/resolve endpoints and atomic password+audit resolution.**

- [ ] **Step 3: Enforce protected allowlist while forced: me, change-password, logout; test blocked Class endpoint is `403`.**

- [ ] **Step 4: Add Login forgot dialog, Admin badge/list/confirm resolve, `/change-password` route; run backend accounts tests + frontend build; commit `feat: add admin password recovery`.**

### Task 2: Notification domain and endpoints

**Files:** Create `backend/notifications/{models,serializers,services,views,urls}.py`, migration/tests; modify config URLs/settings.

- [ ] **Step 1: Write tests for recipient-only list/read and notification count; requests from non-recipient are unavailable.**

- [ ] **Step 2: Implement `Notification(recipient,type,title,link,created_at,read_at)` and `create_notifications(classroom,type,title,link)` using enrolled Student queryset.**

- [ ] **Step 3: Expose `GET /notifications` and `POST /notifications/:id/read`; run `python manage.py test notifications -v 2`; commit `feat: add in-app notifications`.**

### Task 3: Resources and notification-producing mutations

**Files:** Modify classes models/serializers/views/urls/tests, assignments views/tests; create frontend notification/resource clients/components/tests.

- [ ] **Step 1: Write tests for resource bounds/https, Teacher ownership, Student enrollment, one notification each on assignment/resource create.**

- [ ] **Step 2: Add `ClassResource`; call notification service inside existing Assignment transaction and resource creation transaction.**

- [ ] **Step 3: Implement shell unread menu (mark read then navigate) and Teacher/Student resource UI using external `target="_blank" rel="noreferrer"`.**

- [ ] **Step 4: Run `cd backend; python manage.py test notifications classes assignments -v 2` and `cd frontend; npm test; npm run build`; commit `feat: add class resources and notifications`.**

## Feature Gate

No reset email/token is exposed; a non-enrolled Student gets neither resource data nor notification.

