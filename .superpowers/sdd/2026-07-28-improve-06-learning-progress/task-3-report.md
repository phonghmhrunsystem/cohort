# Task 3 — Teacher gradebook page

## Delivered

- Added the Teacher-only `/teacher/classes/:id/gradebook` route and the **Bảng điểm** Class link.
- Added typed Gradebook API access, a JWT-authenticated UTF-8 CSV download, read-only cells for `OPEN`, `SUBMITTED`, `GRADED`, and `CLOSED`, and no edit/import controls.
- Filters run against the already-returned Gradebook rows by student name and learning state.
- The table is semantic (`table`, `caption`, scoped headers), filter controls are labelled, and only `.gradebook-table-wrap` owns horizontal overflow for narrow layouts.

## TDD evidence

The initial targeted run failed because `TeacherGradebookPage` and `getClassGradebook` did not exist. After the minimal implementation, the targeted Gradebook/API/route tests passed (13 tests).

## Verification

- `cd backend; python manage.py test -v 1` — passed: 114 tests in 163.359 seconds.
- `cd frontend; npm test -- --run` — passed: 28 files, 106 tests.
- `cd frontend; npm run build` — passed (`tsc --noEmit` and Vite build).
- `git diff --check` — passed.

## Responsive inspection

The local task worktree Vite app was opened at desktop width (1920px); the app layout loaded normally. The Gradebook narrow layout was then inspected from the rendered structure and CSS: a `min-width: max-content` table sits solely inside `.gradebook-table-wrap { overflow-x: auto; }`, while the application body retains its existing 320px minimum width. The interactive Playwright action stalled before authenticated Student/Gradebook screenshots at 320px could be captured; the automated UI test protects the wrapper/table contract.

## Self-review

- Gradebook data and CSV are fetched only with the selected Class ID; authorization and private-field exclusion remain backend-enforced.
- CSV download includes the session JWT, matching the existing protected-download pattern.
- No bulk edit or import behavior was added.

## Fix round 1 evidence

- Added a distinct UI test for a Class with enrolled students but no assignments; `cd frontend; npm test -- TeacherGradebookPage.test.tsx` passed (1 file, 4 tests).
- Local Vite loaded at `http://127.0.0.1:5174/login`; desktop snapshot evidence is `.playwright-mcp/page-2026-07-28T17-29-29-728Z.yml`.
- Authenticated 320px screenshots remain blocked by the existing Playwright input tool: `mcp__playwright__browser_type` targeting the Email field hung twice and was interrupted after 110.6 seconds and 354.8 seconds respectively. `mcp__playwright__browser_snapshot` continued to succeed; no further browser actions were attempted.
