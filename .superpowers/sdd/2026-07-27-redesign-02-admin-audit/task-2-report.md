# Task 2 report: Admin screens

## Scope verified

- Admin accounts use one native `dialog` for create and edit. Edit keeps email and role read-only; create and edit support the required profile fields and optional password reset.
- Account loading uses a 300 ms debounce and only sends the supported Teacher/Student role values. Cards show active accounts; confirmed deactivation removes a card only after the delete request resolves. A rejected `422` leaves it in place and reports the server response.
- The audit page has one responsive table and loading, empty, and error states. Its client-side metadata display excludes password, token, raw-file, and storage-path values.

## Test evidence

- `npm test` from `frontend` passed: 7 test files, 26 tests, exit 0.
- The focused UI tests cover the 300 ms debounce and supported filter, native dialog, immutable edit fields, retained `422` form state, confirmed/delete-success behavior, rejected deactivation, audit states, one responsive audit region, and sensitive metadata exclusion.
- `npm run build` from `frontend` passed: TypeScript check and Vite production build, exit 0.

## TDD and visual evidence

- The UI implementation and focused tests were already uncommitted when this task was resumed. Their prior red phase was not available to reproduce without discarding user work, so no red-phase claim is made here. The current test suite was run fresh and is green.
- A 320 px/desktop browser inspection could not be performed: no supported local browser command or installed browser runner was available. Static responsive rules cover the requested 320 px account layout (stacked header, filters, and form); desktop retains the grid/table layout.

## Caveats

- Deactivation now checks the shared helper's retained status and only removes after the backend's expected `204`.

## Round 1 follow-up

- `apiResponse` now retains the HTTP status. Deactivation removes a card only when that status is exactly `204`; a successful `200` leaves it present.
- The `422` test now invokes the actual dialog form handler, rejects the request, and verifies that neither the draft nor open-dialog state is cleared before rendering the retained values and field error.
- Audit display now fails closed: it renders only flat `is_active`, `teacher_id`, `cohort_id`, and `student_id` values when they are boolean, finite numbers, or null. Text, bytes, arrays, nested data, and unknown/neutral-key values are omitted.

### TDD and verification evidence

- Focused RED: `npx vitest run src/api.test.ts src/pages/AdminUsersPage.test.tsx src/pages/AuditLogPage.test.tsx` failed as expected before the implementation: `apiResponse` was missing, the `200` delete path did not preserve the card, and neutral-key metadata was rendered.
- Focused GREEN: the same command passed with 18 tests after the implementation.
- Final verification: `npm test` passed with 7 test files / 29 tests; `npm run build` passed with TypeScript and Vite production build.

### 320 px and desktop inspection alternative

- No local browser executable was available on `PATH`; the installed `frontend/node_modules/.bin` contains `vite` and `vitest`, but no Playwright, Puppeteer, or Cypress runner.
- The available renderer/tests and CSS were inspected instead: the default desktop rules use the account grid and two-column filters/form; the verified `@media (max-width: 479.98px)` rules stack the account header, full-width create button, filters, and form to one column. The audit tests render the page and assert exactly one responsive table region. This is structural evidence, not a screenshot-based visual inspection.
