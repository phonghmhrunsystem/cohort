# Class Management MVP — Phase Index

**Goal:** Deliver the local end-to-end class-management demo one independently verifiable phase at a time.

## Run order and token gates

| Gate | Plan | Depends on | Stop condition |
| --- | --- | --- | --- |
| 1 | [Phase 1 — Identity and Admin](2026-07-26-phase-01-identity-admin.md) | None | Admin can create/deactivate accounts; inactive login is rejected; audit is visible. |
| 2 | [Phase 2 — Cohorts and enrollment](2026-07-26-phase-02-cohorts-enrollment.md) | Phase 1 | Teacher enrolls one Student; only that Student can read the cohort. |
| 3 | [Phase 3 — Assignments and rubric](2026-07-26-phase-03-assignments-rubrics.md) | Phase 2 | Enrolled Student reads a rubric assignment and its UTC+7 deadline. |
| 4 | [Phase 4 — Versioned submissions](2026-07-26-phase-04-submissions-files.md) | Phase 3 | Student has v1/v2; Teacher sees only v2; rejected uploads create no file. |
| 5 | [Phase 5 — Grading and results](2026-07-26-phase-05-grading-results.md) | Phase 4 | Teacher grades v2; Student sees result; another upload is rejected. |
| 6 | [Phase 6 — Demo hardening](2026-07-26-phase-06-frontend.md) | Phase 5 | Full backend suite and Playwright journey pass. |

**Control rule:** Run exactly one phase plan per approved token budget. Do not begin the next file until its gate passes and the user explicitly authorizes it.

**Global policy:** React/Vite/TypeScript + Django REST Framework/SQLite/JWT/private local files; UTC at rest and `Asia/Ho_Chi_Minh` in deadline UI; PDF/DOCX only; server-side authorization; `401/403/404/422` policy; no out-of-scope MVP features.
