# Phase 5 — Grading and Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let an owning Teacher grade only the newest submission and let its Student read the resulting total, feedback, and rubric breakdown.

**Architecture:** One grading transaction validates ownership/latest state and grade mode, calculates rubric totals on the server, writes grade/scores/audit, and thereby blocks more submissions for that Student/assignment.

**Tech Stack:** Django, DRF, SQLite, React, TypeScript.

## Global Constraints

- Feedback is required for manual and rubric grades.
- Rubric grade: exactly one score per criterion, `0..criterion.max_score`; server calculates total.
- Manual grade: only without rubric; `0..100`.
- A teacher can grade only latest version; successful grade rejects future uploads; result is private to owner Student/Teacher.

---

### Task 1: Add grading/result API

**Files:**
- Create: `backend/grading/models.py`, `backend/grading/services.py`, `backend/grading/serializers.py`, `backend/grading/views.py`, `backend/grading/urls.py`, `backend/grading/tests/test_grading.py`
- Modify: `backend/config/urls.py`, `backend/submissions/services.py`

**Produces:** `PUT /api/submissions/{id}/grade`, `GET /api/assignments/{id}/my-result`, and `grade_submission(*, teacher, submission, payload)`.

- [x] **Step 1: Write failing tests for required feedback, calculated rubric total, manual range, non-latest denial, grade lock, and private result.**

```python
def test_rubric_grade_total_is_calculated_server_side(self):
    response = self.teacher_client.put(self.grade_url, {"feedback": "Good work", "scores": [{"criterion_id": self.c1.id, "score": 40}, {"criterion_id": self.c2.id, "score": 50}]}, format="json")
    self.assertEqual(response.status_code, 200)
    self.assertEqual(response.json()["total_score"], 90)

def test_only_latest_submission_can_be_graded(self):
    response = self.teacher_client.put(self.old_submission_grade_url, {"total_score": 80, "feedback": "x"})
    self.assertEqual(response.status_code, 422)
```

- [x] **Step 2: Run `cd backend; python manage.py test grading.tests`; expect failure.**

- [x] **Step 3: Add `Grade`/`CriterionScore` and a single atomic grade service that confirms owned cohort and newest version.**

```python
if assignment.rubric_criteria.exists():
    total = sum(validated_scores.values())
else:
    total = validated_data["total_score"]
```

- [x] **Step 4: Require non-blank feedback; validate all-and-only rubric criterion IDs/scores or manual `0..100`; write grade, scores, and audit in the transaction.**

- [x] **Step 5: Make submission creation reject when any grade exists for the Student/assignment; return criterion breakdown in own-result. Migrate and run `python manage.py test grading.tests`; expect PASS. Commit.**

```bash
git add backend
git commit -m "feat: add grading and student results api"
```

### Task 2: Add grading and result UI

**Files:**
- Create: `frontend/src/pages/GradePage.tsx`, `frontend/src/pages/ResultPage.tsx`
- Modify: `frontend/src/components/LatestSubmissions.tsx`, `frontend/src/pages/AssignmentPage.tsx`, `frontend/src/main.tsx`

**Consumes:** Phase 5 grade/result API.

- [x] **Step 1: Render Teacher inputs for every rubric criterion or one manual total, a required feedback field, and the server-returned total after submit.**

- [x] **Step 2: Render Student total, feedback, and rubric-score breakdown; hide grade actions for Students.**

- [x] **Step 3: Browser-check Teacher grades v2, Student sees result, and next upload is rejected. Commit.**

```bash
git add frontend
git commit -m "feat: add grading and result screens"
```

## Phase Gate

Run: `cd backend; python manage.py test grading.tests`

Expected: PASS. Browser proof completes the core demo. Stop before Phase 6.
