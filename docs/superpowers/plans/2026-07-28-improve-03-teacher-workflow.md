# Teacher Roster and Grading Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giáo viên xem roster/progress hữu ích, profile Student read-only và rubric có thể xóa criterion an toàn.

**Architecture:** Backend tính summary/status từ roster/submission/grade; frontend chỉ render. Xóa criterion là local draft rồi replacement rubric PUT atomic.

**Tech Stack:** Django, DRF, React, TypeScript, Vitest.

## Global Constraints

- Assigned Teacher only; Teacher khác không nhận dữ liệu.
- Status duy nhất `CHUA_NOP`, `DA_NOP`, `DA_CHAM`; counts không được frontend tự tính từ list filter.
- Rubric phải có ít nhất một criterion, score 1–100, total exactly 100.

---

### Task 1: Teacher roster/profile/progress endpoint

**Files:** Modify `backend/classes/{serializers,views,urls}.py`, `backend/classes/tests/test_classes.py`.

**Produces:** `GET /classes/:id/students`, `GET /classes/:id/students/:student_id`, Class/assignment summary fields.

- [ ] **Step 1: Write tests for owner Teacher success, other Teacher `404`, Student `403`, 0/total, and submitted/graded counts.**

```python
response = self.other_teacher_client.get(f"/api/classes/{self.classroom.id}/students/{self.student.id}")
self.assertEqual(response.status_code, 404)
self.assertEqual(response.data["submitted_students"], 1)
```

- [ ] **Step 2: Run `cd backend; python manage.py test classes -v 2`; expected FAIL.**

- [ ] **Step 3: Add read-only serializer with profile + shared Classes, and queryset annotation/subquery that returns `submitted_assignments`, `graded_assignments`, plus Class `enrolled_students/submitted_students/graded_students`.**

- [ ] **Step 4: Rerun test; verify no record from another Teacher Class; commit `feat: add teacher roster progress`.**

### Task 2: Rubric validation and criterion deletion

**Files:** Modify `backend/assignments/{serializers,views}.py`, assignment tests; `TeacherClassPage.tsx` and tests.

- [ ] **Step 1: Write backend `criteria=[] -> 422` and frontend test that remove control requires confirmation, leaves Save disabled when total invalid.**

- [ ] **Step 2: Make `RubricSerializer.validate_criteria` reject empty array; keep existing transaction replacement. Render `Xóa` per criterion with AppDialog; confirm only removes draft row.**

```python
if not criteria: raise serializers.ValidationError("Provide at least one rubric criterion.")
```

- [ ] **Step 3: Run `cd backend; python manage.py test assignments -v 2` and `cd frontend; npm test -- TeacherClassPage; npm run build`; commit `feat: support safe rubric criterion removal`.**

### Task 3: Teacher workflow UI language

**Files:** Modify `TeacherClassPage.tsx`, `AssignmentPage.tsx`, `GradePage.tsx`, `classes.ts`, `assignments.ts`, tests.

- [ ] **Step 1: Write tests that roster leads with name and profile action, counts display, grade actions say `Chấm điểm` / `Đã chấm`, filename/time precede version.**

- [ ] **Step 2: Render summary/cards using Task 1 response; use safe profile dialog. Replace old labels and remove any primary `student #id`/version output.**

- [ ] **Step 3: Run `cd frontend; npm test; npm run build`; manual Teacher workflow proof; commit `feat: clarify teacher grading workflow`.**

## Feature Gate

Only assigned Teacher sees roster/profile; a non-submit student visibly has `0 / total`; invalid rubric cannot save.

