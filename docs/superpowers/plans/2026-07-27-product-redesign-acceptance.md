# Product Redesign Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the redesigned demo reproducible and prove the critical role, authorization, and responsive flows.

**Architecture:** Reuse the existing seed migration and current Django/Vitest test tools. Add only deterministic seed updates, focused regression assertions, browser inspection, and README instructions—no production abstractions.

**Tech Stack:** Django test runner, SQLite migrations, Vitest, Vite build, browser devtools/manual QA.

## Global Constraints

- Do not add Playwright or any other dependency; it is not installed.
- Seed data must remain idempotent and use only active Teacher/Student accounts plus the existing Admin login.
- Acceptance verifies 320px and desktop widths, including no page-level horizontal overflow.

---

### Task 1: Refresh deterministic demo data

**Files:**
- Modify: `backend/accounts/migrations/0002_seed_demo_data.py`, `backend/accounts/tests/test_seed.py`, `README.md`
- Create: `backend/assignments/migrations/0002_seed_demo_coursework.py`, `backend/submissions/migrations/0003_seed_demo_submission.py`

**Consumes:** the completed feature migrations. **Produces:** an idempotent demo with accounts, owned cohort/enrollment, assignment/rubric, submission, and graded result.

- [ ] **Step 1: Add failing migration tests that run the seed twice and assert no duplicate users/cohorts/assignments/submissions, correct active roles, and one visible result.**

```python
call_command("migrate", verbosity=0)
call_command("migrate", verbosity=0)
self.assertEqual(User.objects.filter(email="teacher.anh@example.com").count(), 1)
```

- [ ] **Step 2: Run `cd backend; python manage.py test accounts.tests.test_seed -v 2` and confirm failure.**

- [ ] **Step 3: Use `get_or_create` with stable email/name keys in data migrations; create one Teacher-owned cohort with enrolled Student, one rubric assignment, two submission versions, and a grade on v2. Do not store raw paths or passwords in audit metadata.**

- [ ] **Step 4: Update README setup/migrate commands, test credentials, and six-step role demo. Run seed tests and commit.**

```bash
git add backend README.md && git commit -m "feat: seed redesigned demo flow"
```

### Task 2: Close backend authorization and rule coverage

**Files:**
- Modify: `backend/accounts/tests/test_accounts.py`, `backend/cohorts/tests/test_cohorts.py`, `backend/assignments/tests/test_assignments.py`, `backend/submissions/tests/test_submissions.py`, `backend/audit/tests/test_audit.py`

**Consumes:** all feature APIs. **Produces:** a small regression suite proving the specified security and business-rule boundaries.

- [ ] **Step 1: Add one assertion for each previously unproven boundary: backend-restart token invalidation, immutable Admin account, inactive enrollment, cross-owner assignment/grade/download denial, deadline/graded upload denial, and audit metadata exclusion.**

```python
response = self.other_teacher_client.get(f"/api/submissions/{self.submission.id}/download")
self.assertIn(response.status_code, (403, 404))
```

- [ ] **Step 2: Run `cd backend; python manage.py test -v 2` and fix only implementation defects revealed by the new assertions.**

- [ ] **Step 3: Commit the passing regression tests and smallest fixes.**

```bash
git add backend && git commit -m "test: cover redesigned authorization rules"
```

### Task 3: Verify frontend regression and responsive behavior

**Files:**
- Modify: `frontend/src/api.test.ts`, `frontend/src/auth.test.ts`, `frontend/src/cohorts.test.ts`, `frontend/src/styles.css`
- Create: `frontend/src/routes.test.tsx`

**Consumes:** final frontend routes/components. **Produces:** testable session/route controls and documented responsive QA evidence.

- [ ] **Step 1: Add tests for logout cleanup on API failure, one 401 redirect, correct role home destinations, and unknown-route redirect.**

```ts
await expect(logout()).rejects.toMatchObject({ status: 500 });
expect(sessionStorage.getItem("accessToken")).toBeNull();
expect(location.assign).toHaveBeenCalledWith("/login");
```

- [ ] **Step 2: Run `cd frontend; npm test; npm run build` and confirm PASS.**

- [ ] **Step 3: Start both existing dev servers, then manually inspect Login, Admin accounts/audit, Teacher cohorts/detail/grading, and Student cohorts/detail at 320px and 1440px. Check `document.documentElement.scrollWidth <= window.innerWidth` on every non-table page.**

```js
document.documentElement.scrollWidth <= window.innerWidth
```

- [ ] **Step 4: Fix only actual layout overflow/accessibility issues, rerun `npm test; npm run build`, and commit.**

```bash
git add frontend && git commit -m "test: verify redesigned responsive flows"
```

## Feature Gate

`cd backend; python manage.py test` and `cd frontend; npm test; npm run build` pass. The README reproduces the Admin → Teacher → Student → Teacher → Student demo, and all reviewed non-table pages fit at 320px and desktop widths.
