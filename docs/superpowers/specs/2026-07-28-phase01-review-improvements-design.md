# Phase 01 Review Improvements — Feature Index

Source: `review_phase01.md`. These six specifications replace the earlier
phase-oriented summary and are the design source of truth for this improvement
round.

1. [Clear UX and safe actions](2026-07-28-improve-01-clear-ux-design.md)
2. [Account and enrollment management](2026-07-28-improve-02-admin-management-design.md)
3. [Teacher roster and grading workflow](2026-07-28-improve-03-teacher-workflow-design.md)
4. [Personal profile and class teacher](2026-07-28-improve-04-profile-design.md)
5. [Password recovery, notifications, and class resources](2026-07-28-improve-05-recovery-notifications-resources-design.md)
6. [Student learning progress and gradebook](2026-07-28-improve-06-learning-progress-design.md)

## Shared release rules

- Keep Django/DRF authoritative; no frontend or backend dependency is added.
- All protected operations enforce role, ownership, enrollment, class period,
  deadline, and graded-lock on the backend.
- Every mutation creates a safe audit event; never log a password, token, raw
  file content, or private storage path.
- Native dialogs preserve safe input after `422`, prevent duplicate requests,
  and remain usable at 320 px.
- Each feature adds focused Django and Vitest coverage for success, one `422`
  rejection, pending state where relevant, and an authorization boundary.
