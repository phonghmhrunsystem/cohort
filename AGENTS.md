# Repository memory

- docs/overview/00-system-overview.md and its numbered siblings are the target product design. Code can lag them; verify it instead of treating it as authority.
- Backend is Django + DRF in backend/. The frontend was intentionally removed and will be rebuilt as React + Vite + TypeScript.
- API routes are under /api; use 401 unauthenticated, 403 unauthorized, 404 absent/out of scope, and 422 validation/business failure.
- Auth is admin-provisioned: no registration. The legacy password-reset queue is removed; use emailed single-use reset tokens and Admin direct password set.
- Server enforces role/class lifecycle checks. Reuse scoped-Class and active-Class rules from docs/overview/02-classes-and-enrollment.md.
- Audit writes are transactional. Metadata never contains passwords, hashes, tokens, secrets, or free text.
- Preserve unrelated work. Use apply_patch for edits and run focused tests before broad verification.
