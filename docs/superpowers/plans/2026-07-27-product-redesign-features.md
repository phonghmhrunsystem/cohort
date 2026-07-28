# Product Redesign Feature Index

Source plan: [product-redesign-implementation](2026-07-27-product-redesign-implementation.md). This index splits its five independently testable deliverables; retain the source plan for cross-feature constraints.

1. [Authentication and responsive shell](2026-07-27-redesign-01-auth-shell.md)
2. [Admin accounts and audit](2026-07-27-redesign-02-admin-audit.md)
3. [Admin-owned Classes and coursework](2026-07-27-redesign-03-teacher-coursework.md)
4. [Student work and Teacher grading](2026-07-27-redesign-04-submissions-grading.md)
5. [Demo data and acceptance evidence](2026-07-27-redesign-05-acceptance-seed.md)

## Shared release rules

- Add no dependency; Django/DRF remains authoritative for access, ownership, time, files, and grades.
- Store only `access_token` in `sessionStorage`; return `401`, `403`, `404`, and `422` as specified in the source plan.
- Every mutation writes a safe append-only audit event. Native dialogs preserve safe input on `422` and block duplicate pending submissions.
- Verify responsive content at 320 px; only the audit table may scroll horizontally.
