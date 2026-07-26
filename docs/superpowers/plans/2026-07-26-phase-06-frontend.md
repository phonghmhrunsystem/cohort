# Phase 6 — Demo Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the complete demo readable, repeatable, and proven by business-rule API tests plus one Playwright journey.

**Architecture:** Compose role dashboards from existing scoped endpoints, centralize only shared async display states, and add no new domain capability. Verify the same end-to-end sequence the presenter will perform.

**Tech Stack:** React, TypeScript, Playwright, Django test runner, DRF APIClient.

## Global Constraints

- Preserve existing server authorization; UI hides unavailable actions but never replaces authorization.
- Provide readable loading, empty, and field/action error states.
- Test all stated business rules and one denied-access result/file read.

---

### Task 1: Finish role dashboards and shared visible states

**Files:**
- Create: `frontend/src/pages/TeacherDashboard.tsx`, `frontend/src/pages/StudentDashboard.tsx`, `frontend/src/components/AsyncState.tsx`
- Modify: `frontend/src/main.tsx`, existing role pages

**Consumes:** existing cohort, assignment, submission, and result list endpoints. **Produces:** role landing pages without new business API.

- [ ] **Step 1: Add one shared loading/empty/error component and use it on every existing role screen.**

```tsx
export function AsyncState({ error, empty, children }: Props) {
  if (error) return <p role="alert">{error}</p>;
  if (empty) return <p>No items yet.</p>;
  return <>{children}</>;
}
```

- [ ] **Step 2: Add Teacher dashboard from owned cohorts, upcoming deadlines, and latest submissions needing grades; add Student dashboard from enrolled cohorts, open assignments, and recent grades.**

- [ ] **Step 3: Browser-check empty and populated state for each role, keyboard focus on inputs, and a readable API action error. Commit.**

```bash
git add frontend
git commit -m "feat: add role dashboards and async states"
```

### Task 2: Complete API rule coverage and browser journey

**Files:**
- Modify: `backend/accounts/tests/test_accounts.py`, `backend/audit/tests/test_audit.py`, `backend/cohorts/tests/test_cohorts.py`, `backend/assignments/tests/test_assignments.py`, `backend/submissions/tests/test_submissions.py`, `backend/grading/tests/test_grading.py`
- Create: `frontend/e2e/demo.spec.ts`, `frontend/playwright.config.ts`
- Modify: `README.md`

**Produces:** one repeatable test command for backend rules and one complete browser demo proof.

- [ ] **Step 1: Add any missing API assertions: account status, role/ownership, enrollment, future deadline, rejected upload stores no file, version/latest, rubric/manual grading, audit write, and cross-Student result denial.**

```python
def test_student_cannot_read_another_students_result(self):
    response = self.other_student_client.get(f"/api/assignments/{self.assignment.id}/my-result")
    self.assertIn(response.status_code, (403, 404))
```

- [ ] **Step 2: Write the Playwright flow: Admin creates Teacher/Student; Teacher creates cohort/enrollment/rubric assignment; Student uploads twice; Teacher grades v2; Student sees result; unrelated Student is denied.**

```ts
await expect(page.getByText("Version 2")).toBeVisible();
await expect(page.getByText("Total: 90")).toBeVisible();
```

- [ ] **Step 3: Run the full suites against clean SQLite/media state.**

Run: `cd backend; python manage.py test`

Run: `cd frontend; npx playwright test`

Expected: both PASS.

- [ ] **Step 4: Document setup, migrations, both dev servers, test commands, and the exact six-step demo flow. Commit.**

```bash
git add backend frontend README.md
git commit -m "test: harden end-to-end class demo"
```

## Phase Gate

Both full suites pass and README reproduces the demo from a clean checkout. This is the final handoff gate.
