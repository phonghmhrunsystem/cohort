# Task 1 report: account API and audit safety

## Summary

- Added nullable account profile fields and migration `0003_user_profile`.
- Enforced trimmed profile validation, lowercase case-insensitive-unique email, Teacher/Student-only creation, immutable email/role, password reset with `set_password`, active-only Admin account administration, and soft deactivation.
- Blocked deactivation for accounts assigned to a `Cohort` or enrolled in one; the current `Cohort` model has no end-state, so every existing relationship is treated as active.
- Added output-time audit metadata scrubbing and actor display data so legacy unsafe audit rows cannot expose passwords, tokens, raw file data, or paths.

## Files changed

- `backend/accounts/models.py`
- `backend/accounts/migrations/0003_user_profile.py`
- `backend/accounts/serializers.py`
- `backend/accounts/views.py`
- `backend/accounts/tests/test_accounts.py`
- `backend/audit/serializers.py`
- `backend/audit/services.py`
- `backend/audit/tests/test_audit.py`

`backend/accounts/urls.py` did not need a change: the existing detail route handles the added `DELETE` method.

## Test evidence

RED: `cd backend && python manage.py test accounts audit -v 2` exited 1 before implementation, with 14 behavioral failures plus the profile-output assertion exposing the absent serializer field. The failures covered profile bounds/normalization, Admin exclusion, active filtering, password reset, soft delete and Class relationship guards, and audit safety.

GREEN: `cd backend && python manage.py test accounts audit -v 2` exited 0: 28 tests passed in 31.596 seconds.

Migration check: `python manage.py makemigrations --check --dry-run` reported `No changes detected`; `git diff --check` exited 0.

## Commit

- `277f44ed238bedf79a1ae8c7bc240cf23463b286` — `feat: secure account administration`

## Concerns

The current `cohorts.Cohort` schema has neither an active flag nor an end time. The deactivation guard correctly protects every current teacher assignment/enrollment, but a future Class lifecycle field must be included in the guard to allow deactivation after a Class ends.
