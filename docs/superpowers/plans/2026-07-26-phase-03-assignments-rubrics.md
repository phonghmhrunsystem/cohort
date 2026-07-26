# Phase 03 — Assignments and Rubrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give cohort owners assignment management and optional, consistently valid rubrics.

**Architecture:** `assignments` owns assignment and criterion persistence. A rubric replacement service validates the whole candidate rubric and replaces it in a single transaction.

**Tech Stack:** Django ORM transactions, DRF serializers, Django TestCase.

## Global Constraints

- Every assignment has `max_score=100` and belongs to one cohort.
- Only the cohort owner mutates an assignment/rubric; enrolled students may read it.
- A non-empty rubric's criterion maxima total exactly 100.
- Phase 05 adds the rubric-change lock after `Grade` exists.

### Task 1: Assignment model and role-scoped endpoints

**Files:**
- Create: `backend/assignments/models.py`, `backend/assignments/serializers.py`, `backend/assignments/views.py`, `backend/assignments/urls.py`, `backend/assignments/tests/test_assignments.py`
- Modify: `backend/config/urls.py`

**Interfaces:**
- Consumes: `Cohort` and its owner/enrollment scope.
- Produces: `Assignment`, `GET/POST /api/cohorts/{id}/assignments/`, `GET/PATCH /api/assignments/{id}/`.

- [ ] **Step 1: Write failing owner/enrolled-reader tests**

```python
def test_enrolled_student_can_read_assignment(self):
    self.client.force_authenticate(self.enrolled_student)
    self.assertEqual(self.client.get(f'/api/assignments/{self.assignment.id}/').status_code, 200)

def test_other_teacher_cannot_patch_assignment(self):
    self.client.force_authenticate(self.other_teacher)
    self.assertEqual(self.client.patch(self.url, {'title': 'Changed'}).status_code, 403)
```

- [ ] **Step 2: Run tests and verify failure**
- [ ] **Step 3: Implement model, serializers, scoped views, deadline validation, and assignment audit writes**
- [ ] **Step 4: Apply migration and rerun focused tests**
- [ ] **Step 5: Commit**

```bash
git add backend/assignments backend/config
git commit -m "feat: add cohort assignments"
```

### Task 2: Atomic rubric replacement

**Files:**
- Create: `backend/assignments/services.py`, `backend/assignments/tests/test_rubrics.py`
- Modify: `backend/assignments/models.py`, `backend/assignments/serializers.py`, `backend/assignments/views.py`

**Interfaces:**
- Produces: `replace_rubric(*, assignment, criteria, actor)`, `PUT /api/assignments/{id}/rubric`.

- [ ] **Step 1: Write failing rubric tests**

```python
def test_rubric_total_must_equal_100(self):
    response = self.client.put(self.url, {'criteria': [{'title': 'A', 'max_score': 99}]}, format='json')
    self.assertEqual(response.status_code, 422)

def test_replacing_rubric_is_atomic_when_total_is_invalid(self):
    old_ids = list(self.assignment.rubric_criteria.values_list('id', flat=True))
    response = self.client.put(self.url, {'criteria': [{'title': 'A', 'max_score': 99}]}, format='json')
    self.assertEqual(response.status_code, 422)
    self.assertEqual(list(self.assignment.rubric_criteria.values_list('id', flat=True)), old_ids)
```

- [ ] **Step 2: Run tests and verify failure**
- [ ] **Step 3: Validate all criteria before deleting old criteria; replace in `transaction.atomic`; append audit row**
- [ ] **Step 4: Apply migration and rerun focused tests**
- [ ] **Step 5: Commit**

```bash
git add backend/assignments
git commit -m "feat: add validated assignment rubrics"
```
