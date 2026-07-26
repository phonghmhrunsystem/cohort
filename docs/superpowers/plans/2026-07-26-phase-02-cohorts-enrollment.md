# Phase 2 — Cohorts and Enrollment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Teacher manage owned cohorts and enroll existing Students while scoping all reads and writes on the server.

**Architecture:** A cohort has one teacher; an enrollment joins exactly one Student. Views construct role-scoped querysets before serialization and write audit records alongside cohort/enrollment mutations.

**Tech Stack:** Django, DRF, SQLite, React, TypeScript.

## Global Constraints

- Reuse Phase 1 JWT identity and `write_audit`.
- An enrollment is unique by `(cohort, student)` and accepts only `STUDENT` accounts.
- Teacher can affect only owned cohorts; Student can read only enrolled cohorts; inaccessible detail is `404`.

---

### Task 1: Add Cohort and Enrollment domain/API

**Files:**
- Create: `backend/cohorts/models.py`, `backend/cohorts/serializers.py`, `backend/cohorts/views.py`, `backend/cohorts/urls.py`, `backend/cohorts/tests/test_cohorts.py`
- Modify: `backend/config/urls.py`

**Produces:** `GET/POST /api/cohorts`, `GET/PATCH /api/cohorts/{id}`, `POST /api/cohorts/{id}/enrollments`.

- [ ] **Step 1: Write failing ownership, role-validation, duplicate, and Student-scope tests.**

```python
def test_only_enrolled_student_can_read_cohort(self):
    response = self.other_student_client.get(f"/api/cohorts/{self.cohort.id}")
    self.assertEqual(response.status_code, 404)

def test_enrollment_rejects_teacher_account(self):
    response = self.teacher_client.post(f"/api/cohorts/{self.cohort.id}/enrollments", {"student_id": self.other_teacher.id})
    self.assertEqual(response.status_code, 422)
```

- [ ] **Step 2: Run `cd backend; python manage.py test cohorts.tests`; expect failure.**

- [ ] **Step 3: Add `Cohort(teacher,name,description)` and `Enrollment(cohort,student)` with a unique constraint; scope lists/details at the queryset entry point.**

```python
if user.role == User.Role.TEACHER: return Cohort.objects.filter(teacher=user)
if user.role == User.Role.STUDENT: return Cohort.objects.filter(enrollment__student=user)
return Cohort.objects.none()
```

- [ ] **Step 4: Reject non-Student/duplicate enrollment with `422`; use transactions for cohort/enrollment plus audit row.**

- [ ] **Step 5: Migrate and run `python manage.py test cohorts.tests`; expect PASS. Commit.**

```bash
git add backend
git commit -m "feat: add cohorts and enrollment api"
```

### Task 2: Add Teacher and Student cohort screens

**Files:**
- Create: `frontend/src/pages/TeacherCohortsPage.tsx`, `frontend/src/pages/CohortPage.tsx`, `frontend/src/pages/StudentCohortsPage.tsx`
- Modify: `frontend/src/main.tsx`

**Consumes:** Phase 2 cohort API.

- [ ] **Step 1: Add Teacher list/create/edit/detail screens, with enrollment control that lists existing Student accounts only.**

- [ ] **Step 2: Add Student read-only cohort list/detail and display the server error for unavailable cohort links.**

- [ ] **Step 3: Browser-check Teacher creates a cohort and enrolls Student A; Student A sees it and Student B does not. Commit.**

```bash
git add frontend
git commit -m "feat: add cohort screens"
```

## Phase Gate

Run: `cd backend; python manage.py test cohorts.tests`

Expected: PASS. Browser proof confirms server-enforced teacher ownership and Student enrollment scope. Stop before Phase 3.
