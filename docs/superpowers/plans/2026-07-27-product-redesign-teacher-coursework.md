# Teacher Coursework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Teachers safely manage their own cohorts, enroll active Students, and publish/edit assignments with valid rubrics.

**Architecture:** Keep cohort ownership and enrollment in `cohorts`; add a focused `assignments` Django app for assignment and rubric persistence. Teacher React pages consume owner-scoped endpoints and put create/edit actions in native dialog modals.

**Tech Stack:** Django, DRF, SQLite, React, TypeScript, Vitest.

## Global Constraints

- A Teacher may read and mutate only owned cohorts and assignments.
- Cohorts and assignments have no delete endpoint or UI.
- Assignment maximum score is always 100; rubric maxima must sum exactly 100.
- Every success mutation writes an audit record.

---

### Task 1: Tighten cohort and enrollment rules

**Files:**
- Modify: `backend/cohorts/models.py`, `backend/cohorts/serializers.py`, `backend/cohorts/views.py`, `backend/cohorts/tests/test_cohorts.py`
- Create: `backend/cohorts/migrations/0002_cohort_constraints.py`

**Consumes:** active account profile from the auth/admin plan. **Produces:** owner-only `q` cohort search, validated name/description, `GET /cohorts/{id}/students?q=`, and active-student-only enrollment.

- [ ] **Step 1: Add failing tests for whitespace/boundary validation, search, inactive student enrollment, and owner-only enrolled-student list.**

```python
self.student.is_active = False
self.student.save()
response = self.teacher_client.post(f"/api/cohorts/{self.cohort.id}/enrollments", {"student_id": self.student.id})
self.assertEqual(response.status_code, 422)
```

- [ ] **Step 2: Run `cd backend; python manage.py test cohorts -v 2` and confirm failures.**

- [ ] **Step 3: Set cohort field limits to 100/1,000, enforce trimmed values in `CohortSerializer`, use `scoped_cohorts(request.user).filter(name__icontains=q)` for Teacher list, and add an owner-scoped students serializer containing full name, email, and id.**

- [ ] **Step 4: Require `student.role == STUDENT and student.is_active` in enrollment validation; keep the database unique constraint as the concurrent duplicate guard.**

- [ ] **Step 5: Make and run migrations, then rerun cohort tests and commit.**

```bash
git add backend/cohorts && git commit -m "feat: validate teacher cohort enrollment"
```

### Task 2: Add assignment and rubric API

**Files:**
- Create: `backend/assignments/__init__.py`, `backend/assignments/models.py`, `backend/assignments/serializers.py`, `backend/assignments/views.py`, `backend/assignments/urls.py`, `backend/assignments/migrations/__init__.py`, `backend/assignments/migrations/0001_initial.py`, `backend/assignments/tests/__init__.py`, `backend/assignments/tests/test_assignments.py`
- Modify: `backend/config/settings.py`, `backend/config/urls.py`

**Consumes:** `Cohort` and `get_scoped_cohort`. **Produces:** `Assignment`, `RubricCriterion`, owner APIs at `/cohorts/{id}/assignments`, `/assignments/{id}`, and `/assignments/{id}/rubric`.

- [ ] **Step 1: Write failing tests for non-owner access, past creation deadline, valid update, invalid rubric sum, and assignment/rubric audit records.**

```python
response = self.teacher_client.put(f"/api/assignments/{assignment.id}/rubric", {"criteria": [{"title": "Code", "maximum": 80}]}, format="json")
self.assertEqual(response.status_code, 422)
```

- [ ] **Step 2: Run `cd backend; python manage.py test assignments -v 2` and confirm failure because the app/routes do not exist.**

- [ ] **Step 3: Create `Assignment(cohort, title, description, due_at, maximum_score=100)` and `RubricCriterion(assignment, title, maximum_score)` with ordering by id. Add serializers that trim title/description/criterion title, require future `due_at` only when creating, and accept integer scores 1–100.**

- [ ] **Step 4: Implement owner-scoped list/create/detail/patch/rubric views. Replace rubric criteria inside `transaction.atomic()` only after validating their total equals 100; write `assignment.created`, `assignment.updated`, and `assignment.rubric.updated` audit events.**

- [ ] **Step 5: Register the app and URLs, migrate, run `python manage.py test assignments cohorts`, and commit.**

```bash
git add backend/assignments backend/config && git commit -m "feat: add teacher assignments and rubrics"
```

### Task 3: Redesign Teacher cohort list and detail page

**Files:**
- Modify: `frontend/src/cohorts.ts`, `frontend/src/main.tsx`, `frontend/src/pages/TeacherCohortsPage.tsx`, `frontend/src/pages/CohortPage.tsx`, `frontend/src/styles.css`
- Create: `frontend/src/assignments.ts`, `frontend/src/pages/TeacherCohortsPage.test.tsx`, `frontend/src/pages/CohortPage.test.tsx`

**Consumes:** Tasks 1-2 endpoints. **Produces:** `/teacher/cohorts`, `/teacher/cohorts/:id?tab=students|assignments`, searchable cards, and native-dialog create/edit forms.

- [ ] **Step 1: Add failing tests for a cohort card search, omitted `tab` selecting students, and assignment tab using `history.replaceState` with `?tab=assignments`.**

```ts
expect(new URL(location.href).searchParams.get("tab")).toBe("assignments");
```

- [ ] **Step 2: Run `cd frontend; npm test` and confirm failure.**

- [ ] **Step 3: Extend `cohorts.ts` with query and enrolled-student calls; add `assignments.ts` types/functions matching all Task 2 request fields.**

- [ ] **Step 4: Replace the Teacher list form with a card grid, search input, and `<dialog>` cohort modal. Route card links to `/teacher/cohorts/{id}?tab=students`.**

- [ ] **Step 5: Replace the generic cohort page with a Teacher-only detail: native tab buttons, students search/list and Add Student dialog, assignment cards, and one assignment/rubric modal. Preserve frontend field feedback but show API `422` errors.**

- [ ] **Step 6: Run `npm test; npm run build` and commit.**

```bash
git add frontend/src && git commit -m "feat: redesign teacher coursework pages"
```

## Feature Gate

Backend and frontend suites pass. A Teacher can create/edit only their cohort, enroll an active Student once, and create/edit an assignment whose optional rubric totals 100.
