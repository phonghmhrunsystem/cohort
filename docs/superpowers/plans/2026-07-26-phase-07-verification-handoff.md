# Phase 07 — Verification and Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce repeatable evidence that the approved workflow, authorization rules, setup instructions, and UAT criteria work locally.

**Architecture:** Verification layers build on the API and UI already implemented: focused backend tests protect business rules; Playwright proves the browser workflow; README documents the exact local handoff.

**Tech Stack:** Django TestCase, DRF APIClient, Playwright, npm, Python.

## Global Constraints

- Tests must use isolated SQLite/media locations and never preserve uploaded test files.
- E2E uses separate admin, teacher, and student accounts.
- A successful UI state never substitutes for a server-side authorization assertion.

### Task 1: Complete backend acceptance coverage

**Files:**
- Modify: `backend/accounts/tests/test_auth.py`, `backend/audit/tests/test_accounts_audit.py`, `backend/cohorts/tests/test_cohorts.py`, `backend/cohorts/tests/test_enrollments.py`, `backend/assignments/tests/test_rubrics.py`, `backend/submissions/tests/test_uploads.py`, `backend/submissions/tests/test_submission_access.py`, `backend/grading/tests/test_grading.py`, `backend/grading/tests/test_results.py`

**Interfaces:**
- Verifies all protected backend endpoints and business rules from the approved design.

- [ ] **Step 1: Add missing assertion cases only where a requirement has no existing test**

```python
def test_late_upload_does_not_write_file(self):
    response = self.post_at(self.assignment.due_at + timedelta(seconds=1))
    self.assertEqual(response.status_code, 422)
    self.assertFalse(default_storage.exists(self.expected_name))
```

- [ ] **Step 2: Run the full backend suite**

Run: `cd backend; python manage.py test -v 2`

- [ ] **Step 3: Fix only failed production behavior or incorrect test setup; rerun until green**
- [ ] **Step 4: Commit**

```bash
git add backend
git commit -m "test: cover class management acceptance rules"
```

### Task 2: Add the Playwright UAT flow

**Files:**
- Create: `frontend/playwright.config.ts`, `frontend/e2e/class-management.spec.ts`, `frontend/e2e/helpers.ts`
- Modify: `frontend/package.json`

**Interfaces:**
- Verifies: admin creates teacher/student, teacher creates cohort/enrollment/assignment, student uploads twice, teacher grades latest, student reads result, unauthorized user is denied.

- [ ] **Step 1: Write the failing happy-path scenario**

```ts
test('admin to student grading workflow', async ({browser}) => {
  await createAccountsAsAdmin(browser);
  await createRubricAssignmentAsTeacher(browser);
  await submitVersionedWorkAsStudent(browser);
  await gradeLatestWorkAsTeacher(browser, '90');
  await expectResultAsStudent(browser, '90');
});
```

- [ ] **Step 2: Add one denied-access scenario**

```ts
test('student cannot open another students submission', async ({page}) => {
  await login(page, studentB);
  await page.goto(`/submissions/${studentASubmissionId}`);
  await expect(page.getByText('Forbidden')).toBeVisible();
});
```

- [ ] **Step 3: Run Playwright against fresh local backend/frontend servers and repair selectors or product failures**

Run: `cd frontend; npx playwright test`

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "test: add class management browser UAT"
```

### Task 3: Document handoff and capture evidence

**Files:**
- Modify: `README.md`
- Create: `docs/uat/2026-07-29-class-management-evidence.md`

**Interfaces:**
- Produces: setup instructions, demo-user creation instructions, test commands, and a UAT pass/fail record.

- [ ] **Step 1: Add exact prerequisites, environment variables, migrations, local commands, media limit, and test commands to README**
- [ ] **Step 2: Record each UAT-01 through UAT-07 result, command, date, and evidence file path in the evidence document**
- [ ] **Step 3: Run final checks**

Run: `cd backend; python manage.py test -v 2`; `cd frontend; npm run build`; `cd frontend; npx playwright test`

- [ ] **Step 4: Commit**

```bash
git add README.md docs/uat
git commit -m "docs: add class management handoff evidence"
```

