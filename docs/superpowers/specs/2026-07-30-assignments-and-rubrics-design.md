# Feature 03 — Assignments & Rubrics

Implements [docs/overview/03-assignments-and-rubrics.md](../../overview/03-assignments-and-rubrics.md). Backend app `assignments/` already has models/serializers/views/urls; this spec closes the gaps against the doc and builds the frontend (currently 0% — both tabs are placeholder cards, no routes, no types).

## Backend gaps to close

1. **`Assignment.created_at`** — model has no such field. Add `auto_now_add=True`, migration, and change `Meta.ordering` from `("id",)` to `("-created_at",)` (doc: "Default sort is `-created_at`").
2. **Teacher-side list counts** — `AssignmentSerializer` has no `submitted_count`/`graded_count`/`enrolled_count`. `ClassAssignmentsView.get` must add these only when `request.user.role == TEACHER`, computed in the view with one aggregate query each (annotate `Count`), not per-row queries. `grading.Grade` is the actual grade record (the view already checks `Grade.objects.filter(assignment=assignment).exists()` for the rubric-lock) — `AssignmentGrade` in `assignments/models.py` is a separate denormalized lock table per the doc and is not currently written anywhere in `views.py`/`services.py`; use `grading.Grade` for `graded_count`. Build a `{assignment_id: {submitted, graded}}` dict in the view from `Submission.objects.filter(assignment__in=ids).values("assignment").annotate(n=Count("student", distinct=True))` and the equivalent `Grade` query, pass counts into the serializer via context, plus `classroom.enrollments.count()` (same value for every row, one query, no per-assignment cost).
3. Everything else (is_open/is_expired gate, rubric-replace-blocked-once-graded, learning_state, notification fanout, audit log) already matches the doc — no changes.

## Frontend types & API helpers

- `types.ts`: add `RubricCriterion { id, title, maximum_score }` and `Assignment { id, classroom_id, title, description, due_at, maximum_score, criteria, created_at, learning_state, deadline_badge, closure_reason, submitted_count?, graded_count?, enrolled_count? }`.
- `lib/api.ts`: add `classAssignmentsPath(classId)`, plain template strings are fine for `/assignments/{id}` and `/assignments/{id}/rubric` (no filters, matches existing style for non-filtered paths).
- `lib/format.ts`: add one shared `deadlineBadge(dueAt, now)` used by **both** teacher due-date cell and as a client-side fallback display — must reproduce backend's exact Vietnamese strings ("Đã hết hạn" / "Còn hôm nay" / "Còn N ngày") so teacher and student never show different wording for the same date.

## `IconButton.tsx`

Add `EditIcon` (pencil, same SVG conventions as `EyeIcon`/`PowerIcon`/`TrashIcon`: `viewBox 0 0 24 24`, `width/height 18`, `stroke currentColor`). This is the fix for the exact mistake already made and corrected once in Classes (commit `43cd9fe`): do not ship `[Xem][Sửa]` text buttons per the doc's ASCII mock — use `IconLinkButton`/`IconButton` with `row-actions` wrapper from the start.

## `styles.css`

- `.badge-warning` (amber/orange) for teacher `Hết hạn` — `Đang mở` reuses `badge-active`, `Đã đóng` reuses `badge-disabled`; `Hết hạn` must not borrow either since it's a distinct state.
- `.rubric-total-invalid` (red, `var(--color-danger)`) for the "Còn lại" line while criteria total ≠ 100 — reuse the existing danger token, no new hex.

## Teacher — Assignments tab (`TeacherClassPage.tsx`, replaces the placeholder Card)

- Table: Tên / Ngày tạo / Hạn nộp (+ `deadlineBadge`) / Trạng thái (badge) / Đã nộp (`submitted_count/enrolled_count`, `graded_count` badge once >0) / Action.
- Trạng thái computed client-side from `class_` (already loaded) + `assignment.due_at`: `Đang mở` if class open and `now < due_at`, `Hết hạn` if `due_at` passed, `Đã đóng` if class window closed. One small helper function, not inline ternary soup.
- Action column: `IconLinkButton` Eye → `/teacher/assignments/{id}`, `IconButton` Edit → opens Edit dialog. Edit `disabled` once `due_at` passed, with `title="Assignment đã hết hạn, không thể chỉnh sửa."` — same `disabled`+`title` pattern as the Disable button in `AdminClassesPage`.
- `[ Tạo assignment ]` button opens Create dialog.
- Create/Edit dialog (`Dialog.tsx`): Field title, Field description (textarea-sized), Field due_at (datetime-local). `max_score` shown as static read-only text "100", not an input — avoids a doomed-to-422 edit.
- Empty state via `EmptyState` when no assignments.

## Teacher — Assignment detail page (`/teacher/assignments/{id}`, new `TeacherAssignmentPage.tsx`)

In-scope here: header only — title, description, due date, Sửa rubric button opening the rubric dialog (Total/Còn lại, add/remove criterion, Chia đều, Dùng mẫu mặc định, Save disabled unless total===100). Submissions list body is doc 04's responsibility — render `<Card><p className="muted">Submissions — see 04-submissions.</p></Card>` there, same stub convention already used for the Assignments tab today.

## Student — Assignments tab (`StudentClassPage.tsx`, replaces the placeholder Card)

- Table: Tên / Hạn nộp (+ `deadline_badge` from API) / Trạng thái / Điểm / Action, driven by the `learning_state` → {Trạng thái, second action, Điểm} map from the doc (§2.2).
- `CLOSED` row: no second action button, `closure_reason` as a `title` tooltip instead.
- Every row's actions point to `/student/assignments/{id}`.

## Student — Assignment detail page (`/student/assignments/{id}`, new `StudentAssignmentPage.tsx`)

Stub only in this feature — `<Card><p className="muted">…see 04-submissions.</p></Card>` — exists purely so the tab's action buttons resolve to a real page instead of a router 404.

## Routing (`App.tsx`)

Add both new routes under existing teacher/student route groups.

## Tests

- Backend: `created_at` ordering (`-created_at`), teacher-list `submitted_count`/`graded_count`/`enrolled_count` correctness with >1 assignment (regression guard against N+1 — assert query count via `assertNumQueries` if the test suite already does this elsewhere, else at minimum assert correct values).
- Frontend: `TeacherClassPage` — table renders counts/status/badges, Edit disabled past due_at, create dialog rejects submit with rubric-adjacent max_score untouched. `StudentClassPage` — each `learning_state` maps to correct Trạng thái/action/Điểm cell. Follow existing per-page test file convention (`*.test.tsx` next to the page under `frontend/src/test/pages/`).

## Out of scope

Submissions list/detail, grading UI, gradebook — all doc 04/05/06. Notification bell UI (doc 07, backend fanout already exists and is untouched).
