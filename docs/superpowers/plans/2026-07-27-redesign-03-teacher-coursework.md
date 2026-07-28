# Admin-owned Classes and Coursework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace cohorts with Admin-owned Classes, enroll students, and let assigned Teachers manage coursework and rubrics.

**Architecture:** Rename `cohorts` to `classes`; `Class(teacher,name,description,starts_at,ends_at)` and unique Enrollment form the ownership boundary. `assignments` validates teacher-only, in-period mutation and atomic 100-point rubrics.

**Tech Stack:** Django, DRF, SQLite, React, TypeScript, Vitest.

## Scope and contract

- APIs: `GET/POST /classes?q=`, `GET/PATCH /classes/:id`, roster/enrollment endpoints; assignment list/create, detail/update, and `PUT /assignments/:id/rubric`.
- Return `404` for unavailable Class data and `403` for known disallowed operations. Audit every successful mutation.

### Task 1: Classes and enrollment

**Files:** rename `backend/cohorts/` to `backend/classes/`; update config, migrations, account/audit references; create Class tests. Replace cohort frontend API/pages with `classes.ts` and Admin/Teacher Class pages.

- [ ] Add failing tests for Admin-only mutations, active immutable Teacher, date order, scoped search, role ownership reads, period behavior, duplicate/inactive enrollment, and removal blocked after end/submission.
- [ ] Implement model/routes and role matrix; run `cd backend; python manage.py test classes accounts audit -v 2`.
- [ ] Implement Admin Class cards/detail: choose one active Teacher at create, immutable thereafter, scoped student search/add/remove, no delete UI.

### Task 2: Assignments, rubrics, and Teacher UI

**Files:** create `backend/assignments/{models,serializers,views,urls}.py`, migration/tests; create `frontend/src/{classes,assignments}.ts` and Teacher detail/list pages; modify routes/styles/tests.

- [ ] Add failing tests for assigned Teacher mutation, Class-open rule, limits, max 100, future in-period deadline, and atomic rubric total exactly 100.
- [ ] Implement Assignment/RubricCriterion, validate before replacement, compute no client total, audit success; run `cd backend; python manage.py test assignments classes -v 2`.
- [ ] Render teacher Class cards with no Class mutation controls; normalize `tab` to `students`, keep roster read-only, and show assignment create/edit/rubric dialogs only under `assignments`.
- [ ] Run backend tests plus `cd frontend; npm test; npm run build`; manually prove a cross-Teacher request returns no other teacher data.

## Feature gate

Admin alone owns Class structure/enrollment; assigned Teacher alone owns in-period coursework; no rubric outside exactly 100 points can persist.
