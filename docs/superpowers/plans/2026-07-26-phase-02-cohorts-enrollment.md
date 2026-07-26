# Phase 02 — Cohorts and Enrollment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let teachers manage only their cohorts and enroll existing students while enforcing student read scope.

**Architecture:** `cohorts` owns `Cohort` and `Enrollment`. A queryset/policy helper scopes every list/detail operation before serialization; mutations append audit rows in their transaction.

**Tech Stack:** Django ORM, DRF APIClient, SQLite.

## Global Constraints

- Enrollment is unique by `(cohort, student)` and accepts only users with role `STUDENT`.
- Teachers access only cohorts with `teacher=request.user`.
- Students access only enrolled cohorts.

### Task 1: Model and scoped cohort API

**Files:**
- Create: `backend/cohorts/models.py`, `backend/cohorts/serializers.py`, `backend/cohorts/views.py`, `backend/cohorts/urls.py`, `backend/cohorts/tests/test_cohorts.py`
- Modify: `backend/config/urls.py`, `backend/audit/views.py`

**Interfaces:**
- Produces: `Cohort(teacher, name, description)`, `GET/POST /api/cohorts/`, `GET/PATCH /api/cohorts/{id}/`.

- [ ] **Step 1: Write failing ownership/read-scope tests**

```python
def test_teacher_cannot_read_another_teachers_cohort(self):
    self.client.force_authenticate(self.teacher_b)
    self.assertEqual(self.client.get(f'/api/cohorts/{self.cohort_a.id}/').status_code, 403)

def test_student_list_contains_only_enrolled_cohorts(self):
    self.client.force_authenticate(self.student)
    self.assertEqual([item['id'] for item in self.client.get('/api/cohorts/').data], [self.enrolled_cohort.id])
```

- [ ] **Step 2: Run and verify failure**
- [ ] **Step 3: Implement model, role-aware queryset, teacher create/update, student read serializer, and cohort audit writes**
- [ ] **Step 4: Extend audit reads so a teacher receives only events whose target is an owned cohort or its descendant; keep the Phase 01 administrator list unchanged**
- [ ] **Step 5: Apply migrations and rerun focused tests**
- [ ] **Step 6: Commit**

```bash
git add backend/cohorts backend/config
git commit -m "feat: add scoped cohort management"
```

### Task 2: Enrollment API and role validation

**Files:**
- Modify: `backend/cohorts/models.py`, `backend/cohorts/serializers.py`, `backend/cohorts/views.py`
- Create: `backend/cohorts/tests/test_enrollments.py`

**Interfaces:**
- Produces: `Enrollment(cohort, student)`, `POST /api/cohorts/{id}/enrollments`.

- [ ] **Step 1: Write failing enrollment tests**

```python
def test_teacher_can_enroll_student_once(self):
    self.client.force_authenticate(self.owner)
    self.assertEqual(self.client.post(self.url, {'student_id': self.student.id}).status_code, 201)
    self.assertEqual(self.client.post(self.url, {'student_id': self.student.id}).status_code, 422)

def test_teacher_cannot_enroll_an_admin(self):
    self.client.force_authenticate(self.owner)
    self.assertEqual(self.client.post(self.url, {'student_id': self.admin.id}).status_code, 422)
```

- [ ] **Step 2: Run tests and verify failure**
- [ ] **Step 3: Add uniqueness constraint, serializer validation, owner check, and enrollment audit write**
- [ ] **Step 4: Apply migrations; rerun tests**
- [ ] **Step 5: Commit**

```bash
git add backend/cohorts
git commit -m "feat: add cohort enrollment"
```
