# Demo Data and Acceptance Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supply idempotent demo data and prove the complete redesign meets its functional, authorization, and responsive requirements.

**Architecture:** Follow-on migrations use natural keys and `get_or_create`; the README documents local setup and walkthrough. Acceptance tests cover the shared security boundaries before manual responsive QA.

**Tech Stack:** Django, SQLite, React, TypeScript, Vitest.

## Scope and contract

- Seed one Admin, active Teacher/Student, open and ended Classes as needed, enrollment, 100-point rubric, versioned submissions, and one grade.
- Repeated `migrate` produces one row per natural key and never displays passwords, tokens, raw file contents, or absolute storage paths.

### Task 1: Idempotent seed migrations

**Files:** modify seed migration/tests and `README.md`; create follow-on Classes, assignments, and submissions data migrations.

- [ ] Add a failing test that invokes `migrate` twice and checks stable users, Class/enrollment, rubric, submissions, and grade.
- [ ] Add `get_or_create` demo rows and the README setup/walkthrough without sensitive display data.
- [ ] Run the migration idempotence test.

### Task 2: Regression and acceptance evidence

**Files:** modify focused Django/Vitest tests only where a demonstrated gap exists.

- [ ] Add one regression test each for restart-invalid token, deactivation guard, Class ownership, duplicate enrollment, rubric total, late/graded submission, cross-role download/grade, and safe audit metadata.
- [ ] Run `cd backend; python manage.py test -v 2`, then `cd frontend; npm test; npm run build`.
- [ ] At 320 px and desktop inspect every listed screen for valid submit, client-invalid input, matching `422`, pending duplicate prevention, loading, empty, request error, and role redirect. Confirm `document.documentElement.scrollWidth <= window.innerWidth` for every non-table screen.
- [ ] Repair only reproduced defects and rerun both suites plus the acceptance flow.

## Feature gate

All suites pass; seed data remains idempotent; every screen meets responsive and authorization acceptance evidence.
