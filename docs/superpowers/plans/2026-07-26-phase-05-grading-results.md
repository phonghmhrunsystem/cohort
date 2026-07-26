# Phase 05 — Grading and Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owning teacher grade the latest submission and let only its student read the result.

**Architecture:** `grading` owns grade persistence and one atomic service. It verifies the target relationship, validates rubric/manual input, calculates the score server-side, persists the grade, and appends audit data.

**Tech Stack:** Django ORM transactions, DRF serializers, Django TestCase.

## Global Constraints

- One `Grade` exists per submission.
- Only the latest submission can be graded.
- Rubric requests contain every criterion exactly once; score range is `0..criterion.max_score`.
- Without a rubric, manual total is `0..100`; with a rubric the client cannot supply total.

### Task 1: Grade models and atomic service

**Files:**
- Create: `backend/grading/models.py`, `backend/grading/services.py`, `backend/grading/serializers.py`, `backend/grading/views.py`, `backend/grading/urls.py`, `backend/grading/tests/test_grading.py`
- Modify: `backend/config/urls.py`

**Interfaces:**
- Produces: `Grade`, `CriterionScore`, `grade_submission(*, submission, actor, payload)`, `PUT /api/submissions/{id}/grade/`.

- [ ] **Step 1: Write failing rubric-grade tests**

```python
def test_server_calculates_total_from_criteria(self):
    response = self.client.put(self.url, {'criteria': [{'criterion_id': self.a.id, 'score': 40}, {'criterion_id': self.b.id, 'score': 50}]}, format='json')
    self.assertEqual(response.status_code, 200)
    self.assertEqual(response.data['total_score'], 90)

def test_grade_rejects_score_over_criterion_maximum(self):
    response = self.client.put(self.url, {'criteria': [{'criterion_id': self.a.id, 'score': 51}, {'criterion_id': self.b.id, 'score': 50}]}, format='json')
    self.assertEqual(response.status_code, 422)
```

- [ ] **Step 2: Run tests and verify failure**
- [ ] **Step 3: Implement grade/criterion models, full criterion-set validation, transaction, server total, owner/latest check, and grading audit row**
- [ ] **Step 4: Apply migrations and rerun focused tests**
- [ ] **Step 5: Commit**

```bash
git add backend/grading backend/config
git commit -m "feat: add rubric grading"
```

### Task 2: Manual grade and student result policy

**Files:**
- Create: `backend/grading/tests/test_results.py`
- Modify: `backend/grading/serializers.py`, `backend/grading/views.py`, `backend/grading/urls.py`, `backend/submissions/services.py`, `backend/assignments/services.py`

**Interfaces:**
- Produces: manual-grade payload `{total_score, feedback}`, `GET /api/assignments/{id}/my-result/`.

- [ ] **Step 1: Write failing manual/result/lock tests**

```python
def test_manual_grade_accepts_0_and_100_only_within_range(self):
    self.assertEqual(self.put_manual(0).status_code, 200)
    self.assertEqual(self.put_manual(101).status_code, 422)

def test_student_cannot_read_another_students_result(self):
    self.client.force_authenticate(self.other_student)
    self.assertEqual(self.client.get(self.result_url).status_code, 403)

def test_rubric_cannot_change_after_grade(self):
    self.create_grade()
    self.assertEqual(self.client.put(self.rubric_url, {'criteria': []}, format='json').status_code, 422)
```

- [ ] **Step 2: Run tests and verify failure**
- [ ] **Step 3: Add no-rubric validation, result serializer/view, grade-exists check in submission creation service, and rubric-change lock in rubric replacement service**
- [ ] **Step 4: Rerun grading/submission tests and full backend suite**
- [ ] **Step 5: Commit**

```bash
git add backend/grading backend/submissions
git commit -m "feat: expose protected grades and lock submissions"
```
