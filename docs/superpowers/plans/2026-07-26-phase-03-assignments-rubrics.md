# Phase 3 — Assignments and Rubrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owning Teacher create assignments with a future UTC+7 deadline and an optional, immutable 100-point rubric.

**Architecture:** Assignment creation atomically creates its optional rubric criteria. No rubric mutation route exists; deadline updates validate against the current UTC instant and are audited.

**Tech Stack:** Django, DRF, SQLite, React, TypeScript.

## Global Constraints

- `Assignment.max_score` is always `100`.
- A rubric has one or more criteria totalling exactly `100` and cannot change after assignment creation.
- Store `due_at` in UTC; accept/display it in `Asia/Ho_Chi_Minh`; Teacher may only move it to a future time.

---

### Task 1: Add Assignment/Rubric API

**Files:**
- Create: `backend/assignments/models.py`, `backend/assignments/serializers.py`, `backend/assignments/views.py`, `backend/assignments/urls.py`, `backend/assignments/tests/test_assignments.py`
- Modify: `backend/config/urls.py`

**Produces:** `GET/POST /api/cohorts/{id}/assignments`, `GET/PATCH /api/assignments/{id}` with optional `rubric` in its payload.

- [ ] **Step 1: Write failing tests for past deadlines, invalid rubric total, Teacher ownership, and enrolled Student reads.**

```python
def test_rubric_must_total_100(self):
    response = self.teacher_client.post(self.url, {"title": "A", "due_at": future_iso(), "rubric": [{"title": "Code", "max_score": 90}]}, format="json")
    self.assertEqual(response.status_code, 422)

def test_deadline_must_be_future(self):
    response = self.teacher_client.patch(self.assignment_url, {"due_at": past_iso()})
    self.assertEqual(response.status_code, 422)
```

- [ ] **Step 2: Run `cd backend; python manage.py test assignments.tests`; expect failure.**

- [ ] **Step 3: Add `Assignment` and `RubricCriterion`; create all criteria in the assignment transaction and do not register a rubric update endpoint.**

```python
if rubric and sum(item["max_score"] for item in rubric) != 100:
    raise ValidationError({"rubric": "Criterion maxima must total 100."}, code="business_rule")
```

- [ ] **Step 4: Validate `due_at > timezone.now()`, scope all access through the cohort ownership/enrollment relationship, and audit creates/deadline updates.**

- [ ] **Step 5: Migrate and run `python manage.py test assignments.tests`; expect PASS. Commit.**

```bash
git add backend
git commit -m "feat: add assignments and immutable rubrics"
```

### Task 2: Add assignment screens and UTC+7 rendering

**Files:**
- Create: `frontend/src/pages/AssignmentPage.tsx`, `frontend/src/lib/time.ts`
- Modify: `frontend/src/pages/CohortPage.tsx`, `frontend/src/main.tsx`

**Consumes:** Phase 3 assignment API.

- [ ] **Step 1: Add Teacher create/detail UI, using `datetime-local` and helpers that convert its value to UTC ISO on submit and render API ISO dates in `Asia/Ho_Chi_Minh`.**

```ts
export const displayDeadline = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
```

- [ ] **Step 2: Render rubric criteria read-only after creation; do not show an edit-rubric control. Add Student title/description/deadline/rubric detail.**

- [ ] **Step 3: Browser-check an enrolled Student sees a rubric assignment and deadline; verify a past deadline error is readable. Commit.**

```bash
git add frontend
git commit -m "feat: add assignment and rubric screens"
```

## Phase Gate

Run: `cd backend; python manage.py test assignments.tests`

Expected: PASS. Browser proof matches the Phase 3 demo proof. Stop before Phase 4.
