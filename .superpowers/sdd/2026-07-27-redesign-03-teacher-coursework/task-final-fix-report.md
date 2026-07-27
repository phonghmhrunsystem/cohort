# Final Fix Report

Status: Critical/Important review findings fixed; scope preserved.

## Fixes

- Restored the historical `accounts.0002` migration and retained the legacy
  `cohorts` migration graph. The new Class migration now upgrades after the
  historical seed, preserves legacy rows, and removes only obsolete migration
  state.
- Known Admin/enrolled-Student assignment requests return 403; unrelated
  Teacher/unenrolled-Student requests remain 404.
- Class end-time updates cannot precede an existing Assignment deadline.

## TDD and verification

- RED: 3 focused regressions failed with `InconsistentMigrationHistory`,
  `404 != 403`, and `200 != 422`.
- GREEN: `python manage.py test -v 1` — 51 passed.
- `npm test` — 34 passed across 11 files.
- `npm run build` — passed.
- `python manage.py makemigrations --check --dry-run` — no changes detected.
- `git diff --check` — clean.

Commit: `fix: address final coursework review findings`
