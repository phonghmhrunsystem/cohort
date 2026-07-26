# Class Management Implementation Plan — Master Overview

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved local class-management system through independently testable phases.

**Architecture:** A React SPA calls a Django REST modular monolith. Django owns authorization, transactional business rules, SQLite persistence, private media files, and audit rows; React only renders state and submits requests.

**Tech Stack:** Python, Django, Django REST Framework, SimpleJWT, SQLite, React, Vite, TypeScript, Tailwind CSS, Playwright.

## Global Constraints

- Roles are exactly `ADMIN`, `TEACHER`, and `STUDENT`.
- Use JWT for every endpoint except login; return `401`, `403`, `404`, and `422` as specified.
- Store only password hashes; never store passwords, JWTs, raw file content, or absolute paths in audit metadata.
- Files are private; every download request re-checks authorization.
- Validate file extension, MIME type, and size at most 1 GB before storage.
- The server enforces role, ownership, enrollment, deadline, versioning, score, and rubric rules.
- Rubric maximum scores total 100; server computes rubric grade totals.
- Preserve every submission version and return only the latest version per student to a teacher.

## Delivery order and dependency graph

```text
00 foundations
   └─ 01 identity/admin
       └─ 02 cohorts/enrollment
           └─ 03 assignments/rubrics
               └─ 04 submissions/files
                   └─ 05 grading/results
01 + 02 + 03 + 04 + 05 ──► 06 frontend vertical slices
all phases ─────────────────► 07 verification and handoff
```

## Phase plans

| Phase | File | Deliverable | Depends on |
|---|---|---|---|
| 00 | `2026-07-26-phase-00-foundations.md` | Runnable Django/React skeleton and API conventions | None |
| 01 | `2026-07-26-phase-01-identity-admin.md` | Custom user, JWT, admin account controls, audit foundation | 00 |
| 02 | `2026-07-26-phase-02-cohorts-enrollment.md` | Cohort ownership and enrollment scopes | 01 |
| 03 | `2026-07-26-phase-03-assignments-rubrics.md` | Assignments and atomic rubric replacement | 02 |
| 04 | `2026-07-26-phase-04-submissions-files.md` | Versioned private uploads and latest-submission query | 03 |
| 05 | `2026-07-26-phase-05-grading-results.md` | Manual/rubric grading and locked submissions | 04 |
| 06 | `2026-07-26-phase-06-frontend.md` | Role-focused browser workflow | 01–05 |
| 07 | `2026-07-26-phase-07-verification-handoff.md` | E2E/UAT evidence and local handoff | 01–06 |

## Integration gates

- [ ] Complete and commit each phase before starting its dependent phase.
- [ ] Run that phase's focused Django tests before its commit.
- [ ] Run the backend suite after phases 01–05.
- [ ] Run Playwright after phase 06 and again in phase 07.
- [ ] Do not start CSV export unless phase 07 passes.

