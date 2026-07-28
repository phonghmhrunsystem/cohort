# Task 1 report: atomic enrollment replacement

## Scope

Implemented `PUT /api/classes/<id>/enrollments` for Admin roster replacement and restricted the existing candidate-list endpoint (`GET /api/classes/<id>/students`) to Admin. Existing enrollment `POST` and `DELETE` routes were preserved.

## TDD evidence

1. Added route-level tests before production code for Admin-only access, successful replacement and response shape, duplicate/inactive/non-Student rejection without roster mutation, and removal rejection after class end or submission. Updated the existing candidate-list authorization test to its Admin-only contract.
2. Red command: `cd backend; python manage.py test classes -v 2`.
   - Result: 13 tests, 5 expected failures.
   - The new PUT tests failed with `405 != 200/403/422`; the candidate-list authorization test failed with `200 != 403`.
3. Implemented the smallest production path: `EnrollmentSetSerializer` validates a unique list of active Student accounts; `EnrollmentView.put` validates before mutation, locks current enrollments inside `transaction.atomic()`, checks protected removals, diffs/deletes/creates, and writes one class-targeted audit row.
4. Green command: `cd backend; python manage.py test classes -v 2`.
   - Result: `Ran 13 tests in 34.891s`, `OK`.

## Files changed

- `backend/classes/serializers.py`: added `EnrollmentSetSerializer`.
- `backend/classes/views.py`: added transactional PUT replacement and Admin-only candidate listing.
- `backend/classes/tests/test_classes.py`: added/updated behavioral integration tests.

## Verification

- `git diff --check`: exit 0.
- `python manage.py test classes -v 2`: exit 0, 13/13 passing.

## Commit

Pending creation: `feat: replace class enrollment atomically`.

## Concerns

None. The existing URL mapping already routes the collection path to `EnrollmentView`, so no URL change was necessary.

## Review fix: candidate list includes unenrolled students

### TDD evidence

1. Changed `test_detail_and_students_reads_are_role_scoped` to assert the Admin candidate response contains both the enrolled fixture and the active, unenrolled fixture.
2. Red command: `python manage.py test classes.tests.test_classes.ClassApiTests.test_detail_and_students_reads_are_role_scoped -v 2`.
   - Result: failure as expected: the endpoint returned `[11]` and omitted the active unenrolled Student `12`.
3. Minimal production fix: removed the enrollment relation constraint from `StudentsView`; it now selects all active Student accounts, retaining the Admin-only guard and existing text search.
4. Green command: `python manage.py test classes -v 2`.
   - Result: `Ran 13 tests in 45.912s`, `OK`.

### Files changed

- `backend/classes/views.py`
- `backend/classes/tests/test_classes.py`
- `.superpowers/sdd/2026-07-28-improve-02-admin-management/task-1-report.md`

### Fix commit

`fix: include unenrolled student candidates`
