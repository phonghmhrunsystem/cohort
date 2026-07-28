# Account and Enrollment Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin quản lý account bằng list dễ đọc và thay toàn bộ roster bằng một thao tác checkbox atomic.

**Architecture:** `PUT /classes/:id/enrollments` validate toàn bộ desired set trước bất kỳ write nào. Admin Users chỉ filter query hiện có; password reset bị loại khỏi edit account.

**Tech Stack:** Django REST Framework, React, TypeScript, Vitest.

## Global Constraints

- Chỉ Admin được list candidate hoặc replace roster; Teacher assignment immutable.
- Email/role edit là read-only; create vẫn cần email/role/password.
- Removal forbidden sau Class end hoặc Student có submission; `422` không thay đổi roster.

---

### Task 1: Atomic enrollment replacement API

**Files:** Modify `backend/classes/{serializers,views,urls}.py`, `backend/classes/tests/test_classes.py`.

**Produces:** `PUT /classes/{id}/enrollments -> StudentSerializer[]` from `{student_ids:number[]}`.

- [ ] **Step 1: Write failing tests for Admin only, duplicate/inactive/non-Student rejection, forbidden removal and no partial update.**

```python
before = list(self.classroom.enrollments.values_list("student_id", flat=True))
response = self.admin_client.put(url, {"student_ids": [self.student.id, self.teacher.id]}, format="json")
self.assertEqual(response.status_code, 422)
self.assertEqual(list(self.classroom.enrollments.values_list("student_id", flat=True)), before)
```

- [ ] **Step 2: Run `cd backend; python manage.py test classes -v 2`; expected FAIL.**

- [ ] **Step 3: Add `EnrollmentSetSerializer`; lock current rows in `transaction.atomic()`, reject invalid input before delete/create, then diff requested/current sets and write one safe audit row.**

```python
requested, current = set(ids), set(Enrollment.objects.select_for_update().filter(classroom=class_).values_list("student_id", flat=True))
```

- [ ] **Step 4: Rerun backend tests; retain old POST/DELETE only for compatibility; commit `feat: replace class enrollment atomically`.**

### Task 2: Account list and immutable edit contract

**Files:** Modify `backend/accounts/{serializers,views}.py`, account tests; `frontend/src/pages/AdminUsersPage.tsx` and tests.

- [ ] **Step 1: Write tests that `PATCH /users/:id` rejects `email`, `role`, `new_password`; tabs request correct role while preserving q.**

- [ ] **Step 2: Remove `new_password` from `UserUpdateSerializer` and audit only `account.updated`; render `Tất cả/Giáo viên/Học sinh` tab buttons and full-name-first list rows.**

```tsx
const roles = [["", "Tất cả"], ["TEACHER", "Giáo viên"], ["STUDENT", "Học sinh"]] as const;
```

- [ ] **Step 3: Verify `cd backend; python manage.py test accounts -v 2` and `cd frontend; npm test -- AdminUsersPage; npm run build`; commit `feat: simplify admin account editing`.**

### Task 3: Checkbox roster dialog

**Files:** Modify `frontend/src/{classes.ts,pages/AdminClassPage.tsx}`, tests.

- [ ] **Step 1: Write failing test: active Students load/search, current members prechecked, Save sends only one PUT and preserves `422` dialog input.**

- [ ] **Step 2: Replace select/Add Student form with Task 1 `AppDialog` and checkboxes; types expose `replaceEnrollment(classId, studentIds)`.**

```ts
export const replaceEnrollment = (id: number, student_ids: number[]) => api<Student[]>(`/classes/${id}/enrollments`, json("PUT", { student_ids }));
```

- [ ] **Step 3: Run `cd frontend; npm test; npm run build`; manual 320px roster edit; commit `feat: add checkbox class roster management`.**

## Feature Gate

One invalid roster save leaves prior enrollment untouched; edit account cannot alter email/role/password.

