# Assignments & Rubrics Implementation Plan — Frontend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the frontend (currently 0%) for the Assignments & Rubrics feature described in `docs/overview/03-assignments-and-rubrics.md` and specified in `docs/superpowers/specs/2026-07-30-assignments-and-rubrics-design.md`.

**Architecture:** Frontend adds shared types/api/format helpers, one new icon, two CSS classes, then replaces the two placeholder "Assignments" tab cards (`TeacherClassPage.tsx`, `StudentClassPage.tsx`) with real tables + dialogs, and adds two new detail pages (`TeacherAssignmentPage.tsx`, `StudentAssignmentPage.tsx`) wired into `App.tsx`.

**Tech Stack:** React + TypeScript + react-router-dom + Vitest/Testing Library (frontend/src).

**Companion doc:** requires the backend fields (`created_at`, `submitted_count`, `graded_count`, `enrolled_count`) added in `docs/superpowers/plans/2026-07-30-assignments-and-rubrics-backend.md` — run that plan first (or in parallel, but Task 6 onward needs those fields live to fully exercise the teacher table against a real API).

## Global Constraints

- Frontend has no per-request pagination on `GET /api/classes/{id}/assignments` — it returns a plain array, not a `Page<T>`.
- Vietnamese UI strings must match the doc exactly: `Đang mở`, `Hết hạn`, `Đã đóng`, `Đã nộp`, `Chưa nộp`, `Nộp bài`, `Xem lịch sử`, `Xem kết quả`, `Đã chấm`, `Tạo assignment`, `Sửa rubric`, `Chia đều`, `Dùng mẫu mặc định`, `Còn lại`, `Xóa`, `Assignment đã hết hạn, không thể chỉnh sửa.`.
- `IconLinkButton`/`IconButton` + `row-actions` wrapper only — never ship `[Xem][Sửa]` text buttons (this was the exact mistake fixed once already in Classes, commit `43cd9fe`).
- Every new/changed file must follow the existing convention observed in this codebase — same import ordering, same `token()` local helper pattern, same `page-stack`/`Card`/`Table`/`EmptyState` composition already used by `TeacherClassPage.tsx` / `AdminClassesPage.tsx`.

---

## Task 1: Frontend — shared types

**Files:**
- Modify: `frontend/src/types.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `RubricCriterion { id: number; title: string; maximum_score: number }`, `Assignment { id, classroom_id, title, description, due_at, maximum_score, criteria, created_at, learning_state, deadline_badge, closure_reason, submitted_count?, graded_count?, enrolled_count? }`. All later frontend tasks import these two types from `../types`.

- [ ] **Step 1: Add the types**

Append to `frontend/src/types.ts`:

```ts
export interface RubricCriterion {
  id: number;
  title: string;
  maximum_score: number;
}

export interface Assignment {
  id: number;
  classroom_id: number;
  title: string;
  description: string;
  due_at: string;
  maximum_score: number;
  criteria: RubricCriterion[];
  created_at: string;
  learning_state: "OPEN" | "SUBMITTED" | "GRADED" | "CLOSED" | null;
  deadline_badge: string | null;
  closure_reason: string | null;
  submitted_count?: number | null;
  graded_count?: number | null;
  enrolled_count?: number | null;
}
```

- [ ] **Step 2: Verify the project still typechecks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors (new exported types are unused so far, which is fine — they're not yet referenced).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat(frontend): add Assignment and RubricCriterion types"
```

---

## Task 2: Frontend — `classAssignmentsPath` helper

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Test: `frontend/src/test/lib/api.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `classAssignmentsPath(classId: number): string`. `TeacherClassPage.tsx` and `StudentClassPage.tsx` (Tasks 5, 8) call this. Assignment/rubric detail endpoints are inlined as plain template strings (`` `/assignments/${id}` ``, `` `/assignments/${id}/rubric` ``) directly at their call sites — no helper needed for those, matching the existing convention for non-filtered paths (see `` `/classes/${classId}` `` in `TeacherClassPage.tsx:28`).

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/test/lib/api.test.ts`:

```ts
import { classAssignmentsPath } from "../../lib/api";

describe("classAssignmentsPath", () => {
  it("builds the assignments path for a class", () => {
    expect(classAssignmentsPath(9)).toBe("/classes/9/assignments");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/test/lib/api.test.ts`
Expected: FAIL — `classAssignmentsPath` is not exported.

- [ ] **Step 3: Add the helper**

In `frontend/src/lib/api.ts`, add next to `classStudentsPath`:

```ts
export function classAssignmentsPath(classId: number): string {
  return `/classes/${classId}/assignments`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/test/lib/api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/test/lib/api.test.ts
git commit -m "feat(frontend): add classAssignmentsPath helper"
```

---

## Task 3: Frontend — `deadlineBadge` and `formatDateTime`

**Files:**
- Modify: `frontend/src/lib/format.ts`
- Create: `frontend/src/test/lib/format.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `deadlineBadge(dueAt: string, now: Date): string`, `formatDateTime(value?: string | null): string`. Both used by Task 5 (teacher table) and Task 7 (student table); `deadlineBadge` must reproduce backend `assignments/services.py:deadline_badge` exactly (verified in Step 1 against the backend's own test fixtures: `backend/assignments/tests/test_assignments.py:247-250`).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/test/lib/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { deadlineBadge, formatDateTime } from "../../lib/format";

describe("deadlineBadge", () => {
  it("matches the backend's Vietnamese relative-time strings", () => {
    const now = new Date("2026-07-30T10:00:00Z");
    expect(deadlineBadge("2026-07-30T09:00:00Z", now)).toBe("Đã hết hạn");
    expect(deadlineBadge("2026-07-30T23:00:00Z", now)).toBe("Còn hôm nay");
    expect(deadlineBadge("2026-07-31T10:00:00Z", now)).toBe("Còn 1 ngày");
    expect(deadlineBadge("2026-08-02T10:00:00Z", now)).toBe("Còn 3 ngày");
  });
});

describe("formatDateTime", () => {
  it("formats an ISO string as yyyy-mm-dd HH:mm in 24-hour time", () => {
    expect(formatDateTime("2026-08-15T20:00:00Z")).toMatch(/^2026-08-15 \d{2}:\d{2}$/);
  });

  it("returns an em dash for a missing value", () => {
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime(null)).toBe("—");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/test/lib/format.test.ts`
Expected: FAIL — `deadlineBadge`/`formatDateTime` not exported.

- [ ] **Step 3: Implement both functions**

Append to `frontend/src/lib/format.ts`:

```ts
export function deadlineBadge(dueAt: string, now: Date): string {
  const due = new Date(dueAt);
  if (now >= due) return "Đã hết hạn";
  const dueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((dueDate.getTime() - nowDate.getTime()) / 86_400_000);
  return days === 0 ? "Còn hôm nay" : `Còn ${days} ngày`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat("en-CA").format(date);
  const timePart = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return `${datePart} ${timePart}`;
}
```

(Note: this is a client-side approximation of the server's `deadline_badge` — used as a fallback for the teacher table and to render the API-provided `deadline_badge` string as-is for the student table; the test above pins it to the exact backend fixtures so wording never drifts.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/test/lib/format.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/format.ts frontend/src/test/lib/format.test.ts
git commit -m "feat(frontend): add deadlineBadge and formatDateTime helpers"
```

---

## Task 4: Frontend — `EditIcon`, `Textarea`, and new CSS classes

**Files:**
- Modify: `frontend/src/components/IconButton.tsx`
- Modify: `frontend/src/components/Field.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: nothing new.
- Produces: `EditIcon` (exported from `IconButton.tsx`, same call signature as `EyeIcon`), `Textarea` (exported from `Field.tsx`, same prop shape as `Select` but for `HTMLTextAreaElement`, with a `rows?: number` prop defaulting to 4). Task 5 uses both; Task 5/6 use the new `.badge-warning`/`.rubric-total-invalid` CSS classes.

- [ ] **Step 1: Add `EditIcon`**

In `frontend/src/components/IconButton.tsx`, add next to `EyeIcon`:

```tsx
export const EditIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
```

- [ ] **Step 2: Add `Textarea`**

In `frontend/src/components/Field.tsx`, add `TextareaHTMLAttributes` to the top-level import and add the component after `Select`:

```ts
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
```

```tsx
export function Textarea({ id, label, error, hint, wide, rows = 4, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & Labelled & { rows?: number }) {
  return <Wrapper id={id} label={label} hint={hint} error={error} required={props.required} wide={wide}>
    <textarea id={id} rows={rows} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...props} />
  </Wrapper>;
}
```

- [ ] **Step 3: Add the CSS classes**

In `frontend/src/styles.css`, change the input/select rule to also cover textareas:

```css
.field input, .field select { width: 100%; min-height: 2.75rem; padding: .5rem .75rem; border: 1px solid var(--color-border); border-radius: .375rem; background-color: var(--color-surface); color: var(--color-text); }
```

becomes:

```css
.field input, .field select, .field textarea { width: 100%; min-height: 2.75rem; padding: .5rem .75rem; border: 1px solid var(--color-border); border-radius: .375rem; background-color: var(--color-surface); color: var(--color-text); font: inherit; }
.field textarea { min-height: 6rem; resize: vertical; }
```

Then add, near `.badge-active`/`.badge-disabled`:

```css
.badge-active { background: #d1fae5; color: #047857; }.badge-disabled { background: #e2e8f0; color: #334155; }.badge-warning { background: #fef3c7; color: var(--color-warning); }
```

And add, near `.field-error, .field [role="alert"], .alert`:

```css
.rubric-total-invalid { color: var(--color-danger); font-weight: 600; }
```

- [ ] **Step 4: Verify the project still typechecks and builds**

Run: `cd frontend && npx tsc --noEmit && npx vite build`
Expected: no errors (new exports are unused so far, which is fine).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/IconButton.tsx frontend/src/components/Field.tsx frontend/src/styles.css
git commit -m "feat(frontend): add EditIcon, Textarea, badge-warning and rubric-total-invalid"
```

---

## Task 5: Frontend — Teacher Assignments tab (table)

**Files:**
- Modify: `frontend/src/pages/teacher/TeacherClassPage.tsx`
- Modify: `frontend/src/test/pages/TeacherClassPage.test.tsx`

**Interfaces:**
- Consumes: `Assignment` type (Task 1), `classAssignmentsPath` (Task 2), `deadlineBadge`/`formatDateTime` (Task 3), `Badge` component (`frontend/src/components/Badge.tsx`, already exists), `.badge-warning` (Task 4).
- Produces: an `assignmentStatus(class_: ClassRow, assignment: Assignment, now: Date): "Đang mở" | "Hết hạn" | "Đã đóng"` helper (module-scope, exported only if a later task needs it — it doesn't, keep it unexported) and the rendered table. Task 6 adds the Create/Edit dialog on top of this table in the same file.

- [ ] **Step 1: Write the failing test**

Replace the `it("renders a placeholder for the Assignments tab", ...)` test in `frontend/src/test/pages/TeacherClassPage.test.tsx` with:

```ts
const assignmentRow = (overrides: Partial<import("../../types").Assignment> = {}) => ({
  id: 1, classroom_id: 9, title: "Homework 1", description: "Build a small app.",
  due_at: "2026-08-15T20:00:00Z", maximum_score: 100, criteria: [], created_at: "2026-07-20T00:00:00Z",
  learning_state: null, deadline_badge: null, closure_reason: null,
  submitted_count: 12, graded_count: 0, enrolled_count: 24,
  ...overrides,
});
```

(add this near the top of the file, alongside the existing `roster`/`json` fixtures)

```ts
  it("renders the Assignments tab table with counts, status and edit-disabled past due date", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(roster()))
      .mockResolvedValueOnce(json([
        assignmentRow({ id: 1, title: "Homework 1", due_at: "2999-01-01T20:00:00Z", submitted_count: 12, graded_count: 0, enrolled_count: 24 }),
        assignmentRow({ id: 2, title: "Homework 2", due_at: "2000-01-01T20:00:00Z", submitted_count: 22, graded_count: 22, enrolled_count: 24 }),
      ]));
    openPage(fetchMock);
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    await events.click(screen.getByRole("tab", { name: "Assignments" }));

    await waitFor(() => expect(screen.getByText("Homework 1")).toBeTruthy());
    expect(screen.getByText("12/24")).toBeTruthy();
    expect(screen.getByText("22/24")).toBeTruthy();
    expect(screen.getByText("22 đã chấm")).toBeTruthy();
    const editButtons = screen.getAllByRole("button", { name: "Sửa" });
    expect(editButtons[0].hasAttribute("disabled")).toBe(false);
    expect(editButtons[1].hasAttribute("disabled")).toBe(true);
    expect(editButtons[1].getAttribute("title")).toBe("Assignment đã hết hạn, không thể chỉnh sửa.");
  });

  it("shows an empty state when there are no assignments", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(roster()))
      .mockResolvedValueOnce(json([]));
    openPage(fetchMock);
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    await events.click(screen.getByRole("tab", { name: "Assignments" }));

    await waitFor(() => expect(screen.getByText("No assignments.")).toBeTruthy());
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/test/pages/TeacherClassPage.test.tsx`
Expected: FAIL — placeholder text still rendered, no table.

- [ ] **Step 3: Implement the table**

In `frontend/src/pages/teacher/TeacherClassPage.tsx`, update imports:

```tsx
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Alert } from "../../components/Alert";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { Field } from "../../components/Field";
import { EditIcon, EyeIcon, IconButton, IconLinkButton } from "../../components/IconButton";
import { Spinner } from "../../components/Spinner";
import { Table } from "../../components/Table";
import { classAssignmentsPath, classStudentsPath, request } from "../../lib/api";
import { deadlineBadge, formatDate, formatDateTime } from "../../lib/format";
import type { Assignment, ClassRow, RosterResponse } from "../../types";
```

Add, above the `TeacherClassPage` function:

```tsx
function assignmentStatus(class_: ClassRow, assignment: Assignment, now: Date): "Đang mở" | "Hết hạn" | "Đã đóng" {
  const classOpen = class_.is_active && new Date(class_.starts_at) <= now && now < new Date(class_.ends_at);
  if (!classOpen) return "Đã đóng";
  return now < new Date(assignment.due_at) ? "Đang mở" : "Hết hạn";
}

function statusBadgeClass(status: string): string {
  if (status === "Đang mở") return "badge-active";
  if (status === "Hết hạn") return "badge-warning";
  return "badge-disabled";
}
```

Inside the component, after the existing `loadRoster`/roster `useEffect`, add:

```tsx
  const [assignments, setAssignments] = useState<Assignment[]>();
  const [assignmentsFailure, setAssignmentsFailure] = useState("");

  const loadAssignments = useCallback(() => {
    if (!classId) return;
    request<Assignment[]>(classAssignmentsPath(Number(classId)), { token: token() })
      .then((value) => value && setAssignments(value))
      .catch(() => setAssignmentsFailure("Unable to load assignments."));
  }, [classId]);
  useEffect(() => { if (tab === "assignments") loadAssignments(); }, [loadAssignments, tab]);
```

Replace the placeholder line:

```tsx
    {tab === "assignments" && <Card><p className="muted">Assignments — see 03-assignments-and-rubrics.</p></Card>}
```

with:

```tsx
    {tab === "assignments" && <Card>
      <div className="page-header"><h2>Assignments</h2></div>
      {assignmentsFailure && <Alert>{assignmentsFailure}</Alert>}
      {!assignments ? <Spinner label="Loading assignments" /> :
        assignments.length === 0 ? <EmptyState>No assignments.</EmptyState> :
          <Table><thead><tr><th>Tên</th><th>Ngày tạo</th><th>Hạn nộp</th><th>Trạng thái</th><th>Đã nộp</th><th>Action</th></tr></thead>
            <tbody>{assignments.map((assignment) => {
              const now = new Date();
              const status = assignmentStatus(class_, assignment, now);
              const editDisabled = new Date(assignment.due_at) <= now;
              return <tr key={assignment.id}>
                <td>{assignment.title}</td>
                <td>{formatDate(assignment.created_at)}</td>
                <td>{formatDateTime(assignment.due_at)}<br /><span className="muted">{deadlineBadge(assignment.due_at, now)}</span></td>
                <td><Badge className={statusBadgeClass(status)}>{status}</Badge></td>
                <td>{assignment.submitted_count ?? 0}/{assignment.enrolled_count ?? 0}{!!assignment.graded_count && <> <Badge className="badge-active">{assignment.graded_count} đã chấm</Badge></>}</td>
                <td><div className="row-actions">
                  <IconLinkButton to={`/teacher/assignments/${assignment.id}`} icon={<EyeIcon />} label="Xem" />
                  <IconButton icon={<EditIcon />} label="Sửa" disabled={editDisabled} title={editDisabled ? "Assignment đã hết hạn, không thể chỉnh sửa." : undefined} onClick={() => {}} />
                </div></td>
              </tr>;
            })}</tbody>
          </Table>}
    </Card>}
```

(The Edit button's `onClick` is a no-op stub here — Task 6 wires it to open the Create/Edit dialog.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/test/pages/TeacherClassPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/teacher/TeacherClassPage.tsx frontend/src/test/pages/TeacherClassPage.test.tsx
git commit -m "feat(frontend): render the teacher Assignments tab table"
```

---

## Task 6: Frontend — Teacher Create/Edit assignment dialog

**Files:**
- Modify: `frontend/src/pages/teacher/TeacherClassPage.tsx`
- Modify: `frontend/src/test/pages/TeacherClassPage.test.tsx`

**Interfaces:**
- Consumes: `Textarea` (Task 4), `Dialog` (`frontend/src/components/Dialog.tsx`), `useToast` (`frontend/src/components/Toast.tsx`), `ApiFailure` (`frontend/src/lib/errors.ts`), `FieldErrors` type, the table/helpers from Task 5.
- Produces: the `[ Tạo assignment ]` button and working Create/Edit dialog; wires the Task 5 Edit button's `onClick`.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/test/pages/TeacherClassPage.test.tsx`:

```ts
  it("creates an assignment through the dialog and reloads the table", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(roster()))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json(assignmentRow({ id: 3, title: "New one" }), 201))
      .mockResolvedValueOnce(json([assignmentRow({ id: 3, title: "New one" })]));
    openPage(fetchMock);
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    await events.click(screen.getByRole("tab", { name: "Assignments" }));
    await waitFor(() => expect(screen.getByText("No assignments.")).toBeTruthy());

    await events.click(screen.getByRole("button", { name: "Tạo assignment" }));
    await events.type(screen.getByLabelText("Title"), "New one");
    await events.type(screen.getByLabelText("Description"), "A brand new assignment.");
    await events.type(screen.getByLabelText("Due at"), "2999-01-01T20:00");
    await events.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("New one")).toBeTruthy());
    expect(fetchMock.mock.calls[3][0]).toBe("/api/classes/9/assignments");
    expect(fetchMock.mock.calls[3][1]?.method).toBe("POST");
  });

  it("disables saving with a static max score field", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(roster()))
      .mockResolvedValueOnce(json([]));
    openPage(fetchMock);
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    await events.click(screen.getByRole("tab", { name: "Assignments" }));
    await waitFor(() => expect(screen.getByText("No assignments.")).toBeTruthy());

    await events.click(screen.getByRole("button", { name: "Tạo assignment" }));
    expect(screen.queryByLabelText("Max score")).toBeNull();
    expect(screen.getByText("100")).toBeTruthy();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/test/pages/TeacherClassPage.test.tsx`
Expected: FAIL — no "Tạo assignment" button exists yet.

- [ ] **Step 3: Implement the dialog**

Update imports in `frontend/src/pages/teacher/TeacherClassPage.tsx`:

```tsx
import { Dialog } from "../../components/Dialog";
import { Field, Textarea } from "../../components/Field";
import { useToast } from "../../components/Toast";
import { ApiFailure } from "../../lib/errors";
import type { Assignment, ClassRow, FieldErrors, RosterResponse } from "../../types";
```

Inside the component, after the `assignments`/`loadAssignments` state from Task 5, add:

```tsx
  const [dialogAssignment, setDialogAssignment] = useState<Assignment | "new">();
  const [assignmentDraft, setAssignmentDraft] = useState({ title: "", description: "", due_at: "" });
  const [assignmentErrors, setAssignmentErrors] = useState<FieldErrors>({});
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const toast = useToast();

  function openCreate() {
    setAssignmentDraft({ title: "", description: "", due_at: "" });
    setAssignmentErrors({});
    setDialogAssignment("new");
  }
  function openEdit(assignment: Assignment) {
    setAssignmentDraft({ title: assignment.title, description: assignment.description, due_at: assignment.due_at.slice(0, 16) });
    setAssignmentErrors({});
    setDialogAssignment(assignment);
  }
  async function saveAssignment(event: FormEvent) {
    event.preventDefault();
    if (!dialogAssignment || !classId) return;
    setAssignmentBusy(true);
    const payload = { title: assignmentDraft.title.trim(), description: assignmentDraft.description.trim(), due_at: assignmentDraft.due_at };
    try {
      if (dialogAssignment === "new") {
        await request<Assignment>(classAssignmentsPath(Number(classId)), { method: "POST", token: token(), body: payload });
      } else {
        await request<Assignment>(`/assignments/${dialogAssignment.id}`, { method: "PATCH", token: token(), body: payload });
      }
      setDialogAssignment(undefined);
      loadAssignments();
    } catch (error) {
      if (error instanceof ApiFailure && error.fields) setAssignmentErrors(error.fields);
      else toast.error(error instanceof Error ? error.message : "Unable to save assignment.");
    } finally {
      setAssignmentBusy(false);
    }
  }
```

Update the `[ Tạo assignment ]` header and wire the Edit button's `onClick` from Task 5:

```tsx
      <div className="page-header"><h2>Assignments</h2><Button onClick={openCreate}>Tạo assignment</Button></div>
```

```tsx
                  <IconButton icon={<EditIcon />} label="Sửa" disabled={editDisabled} title={editDisabled ? "Assignment đã hết hạn, không thể chỉnh sửa." : undefined} onClick={() => openEdit(assignment)} />
```

Add the dialog markup right after the closing `</Card>` of the assignments tab block:

```tsx
    {dialogAssignment && <Dialog open onClose={() => setDialogAssignment(undefined)} title={dialogAssignment === "new" ? "Tạo assignment" : "Sửa assignment"}>
      <form noValidate onSubmit={saveAssignment}>
        <Field id="assignment-title" label="Title" required value={assignmentDraft.title} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, title: event.target.value })} error={assignmentErrors.title?.[0]} />
        <Textarea id="assignment-description" label="Description" required rows={4} value={assignmentDraft.description} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, description: event.target.value })} error={assignmentErrors.description?.[0]} />
        <Field id="assignment-due-at" label="Due at" type="datetime-local" required value={assignmentDraft.due_at} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, due_at: event.target.value })} error={assignmentErrors.due_at?.[0]} />
        <div className="field"><label>Max score</label><p>100</p></div>
        <div className="dialog-actions">
          <Button type="button" className="button-secondary" disabled={assignmentBusy} onClick={() => setDialogAssignment(undefined)}>Cancel</Button>
          <Button type="submit" disabled={assignmentBusy}>{assignmentBusy ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Dialog>}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/test/pages/TeacherClassPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/teacher/TeacherClassPage.tsx frontend/src/test/pages/TeacherClassPage.test.tsx
git commit -m "feat(frontend): add teacher Create/Edit assignment dialog"
```

---

## Task 7: Frontend — Teacher assignment detail page + rubric dialog

**Files:**
- Create: `frontend/src/pages/teacher/TeacherAssignmentPage.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/test/pages/TeacherAssignmentPage.test.tsx`

**Interfaces:**
- Consumes: `Assignment`/`RubricCriterion` types (Task 1), `formatDateTime` (Task 3), `.rubric-total-invalid` (Task 4), `Dialog`/`Field`/`Button`/`Card`/`Alert`/`Spinner`.
- Produces: route `/teacher/assignments/:assignmentId` rendering `TeacherAssignmentPage`. This is the page Task 5/6's `IconLinkButton to={\`/teacher/assignments/${assignment.id}\`}` navigates to.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/test/pages/TeacherAssignmentPage.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { TeacherAssignmentPage } from "../../pages/teacher/TeacherAssignmentPage";

const assignment = (overrides = {}) => ({
  id: 5, classroom_id: 9, title: "Homework 1", description: "Build a small app.",
  due_at: "2026-08-15T20:00:00Z", maximum_score: 100,
  criteria: [{ id: 1, title: "Code", maximum_score: 60 }, { id: 2, title: "Tests", maximum_score: 40 }],
  created_at: "2026-07-20T00:00:00Z", learning_state: null, deadline_badge: null, closure_reason: null,
  submitted_count: 0, graded_count: 0, enrolled_count: 0,
  ...overrides,
});
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});

function openPage(fetchMock: ReturnType<typeof vi.fn>) {
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MemoryRouter initialEntries={["/teacher/assignments/5"]}>
      <Routes>
        <Route path="/teacher/assignments/:assignmentId" element={<TeacherAssignmentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Teacher assignment page", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders the assignment header and a submissions stub", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(assignment())));

    await waitFor(() => expect(screen.getByText("Homework 1")).toBeTruthy());
    expect(screen.getByText("Build a small app.")).toBeTruthy();
    expect(screen.getByText("Submissions — see 04-submissions.")).toBeTruthy();
  });

  it("opens the rubric dialog pre-filled with existing criteria and enables Save once total is 100", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(assignment())));
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Homework 1")).toBeTruthy());

    await events.click(screen.getByRole("button", { name: "Sửa rubric" }));
    expect(screen.getByText("Total: 100 / 100")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save rubric" }).hasAttribute("disabled")).toBe(false);

    const firstPoints = screen.getAllByLabelText("Points")[0];
    await events.clear(firstPoints);
    await events.type(firstPoints, "50");
    expect(screen.getByRole("button", { name: "Save rubric" }).hasAttribute("disabled")).toBe(true);
  });

  it("Chia đều splits 100 evenly with the remainder on the first criterion", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(assignment({ criteria: [{ id: 1, title: "A", maximum_score: 34 }, { id: 2, title: "B", maximum_score: 33 }, { id: 3, title: "C", maximum_score: 33 }] }))));
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Homework 1")).toBeTruthy());
    await events.click(screen.getByRole("button", { name: "Sửa rubric" }));
    await events.click(screen.getByRole("button", { name: "Chia đều" }));

    expect((screen.getAllByLabelText("Points")[0] as HTMLInputElement).value).toBe("34");
    expect((screen.getAllByLabelText("Points")[1] as HTMLInputElement).value).toBe("33");
    expect((screen.getAllByLabelText("Points")[2] as HTMLInputElement).value).toBe("33");
  });

  it("Dùng mẫu mặc định fills the three default criteria", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(assignment({ criteria: [] }))));
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Homework 1")).toBeTruthy());
    await events.click(screen.getByRole("button", { name: "Sửa rubric" }));
    await events.click(screen.getByRole("button", { name: "Dùng mẫu mặc định" }));

    expect(screen.getByDisplayValue("Đúng yêu cầu")).toBeTruthy();
    expect(screen.getByDisplayValue("Chất lượng")).toBeTruthy();
    expect(screen.getByDisplayValue("Trình bày")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/test/pages/TeacherAssignmentPage.test.tsx`
Expected: FAIL — module `../../pages/teacher/TeacherAssignmentPage` does not exist.

- [ ] **Step 3: Implement the page**

Create `frontend/src/pages/teacher/TeacherAssignmentPage.tsx`:

```tsx
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Dialog } from "../../components/Dialog";
import { Field } from "../../components/Field";
import { Spinner } from "../../components/Spinner";
import { request } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import type { Assignment } from "../../types";

const token = () => sessionStorage.getItem("access_token") ?? undefined;

const DEFAULT_TEMPLATE = [
  { title: "Đúng yêu cầu", maximum_score: 40 },
  { title: "Chất lượng", maximum_score: 30 },
  { title: "Trình bày", maximum_score: 30 },
];

type CriterionDraft = { title: string; maximum_score: string };

export function TeacherAssignmentPage() {
  const { assignmentId } = useParams();
  const [assignment, setAssignment] = useState<Assignment>();
  const [failure, setFailure] = useState("");
  const [rubricOpen, setRubricOpen] = useState(false);
  const [criteria, setCriteria] = useState<CriterionDraft[]>([]);
  const [rubricFailure, setRubricFailure] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    request<Assignment>(`/assignments/${assignmentId}`, { token: token() })
      .then((value) => value && setAssignment(value))
      .catch(() => setFailure("Unable to load assignment."));
  }, [assignmentId]);
  useEffect(() => { load(); }, [load]);

  const total = criteria.reduce((sum, criterion) => sum + (Number(criterion.maximum_score) || 0), 0);

  function openRubric() {
    const source = assignment?.criteria.length ? assignment.criteria : DEFAULT_TEMPLATE;
    setCriteria(source.map((criterion) => ({ title: criterion.title, maximum_score: String(criterion.maximum_score) })));
    setRubricFailure("");
    setRubricOpen(true);
  }
  const addCriterion = () => setCriteria([...criteria, { title: "", maximum_score: "0" }]);
  const removeCriterion = (index: number) => setCriteria(criteria.filter((_, i) => i !== index));
  const updateCriterion = (index: number, field: keyof CriterionDraft, value: string) =>
    setCriteria(criteria.map((criterion, i) => (i === index ? { ...criterion, [field]: value } : criterion)));
  const splitEvenly = () => {
    if (!criteria.length) return;
    const base = Math.floor(100 / criteria.length);
    const remainder = 100 - base * criteria.length;
    setCriteria(criteria.map((criterion, i) => ({ ...criterion, maximum_score: String(base + (i === 0 ? remainder : 0)) })));
  };
  const useDefaultTemplate = () => setCriteria(DEFAULT_TEMPLATE.map((criterion) => ({ title: criterion.title, maximum_score: String(criterion.maximum_score) })));

  async function saveRubric(event: FormEvent) {
    event.preventDefault();
    if (!assignmentId || total !== 100 || !criteria.length) return;
    setBusy(true);
    setRubricFailure("");
    try {
      const saved = await request<Assignment>(`/assignments/${assignmentId}/rubric`, {
        method: "PUT",
        token: token(),
        body: { criteria: criteria.map((criterion) => ({ title: criterion.title.trim(), maximum_score: Number(criterion.maximum_score) })) },
      });
      if (saved) setAssignment(saved);
      setRubricOpen(false);
    } catch (error) {
      setRubricFailure(error instanceof Error ? error.message : "Unable to save rubric.");
    } finally {
      setBusy(false);
    }
  }

  if (failure) return <Alert>{failure}</Alert>;
  if (!assignment) return <Spinner label="Loading assignment" />;
  return <section className="page-stack">
    <Link className="back-link" to={`/teacher/classes/${assignment.classroom_id}?tab=assignments`}>‹ Back</Link>
    <h1>{assignment.title}</h1>
    <p>{assignment.description}</p>
    <p>Hạn nộp: {formatDateTime(assignment.due_at)}</p>
    <Button onClick={openRubric}>Sửa rubric</Button>
    <Card><p className="muted">Submissions — see 04-submissions.</p></Card>
    {rubricOpen && <Dialog open onClose={() => setRubricOpen(false)} title="Sửa rubric" className="dialog-fixed">
      <form noValidate onSubmit={saveRubric}>
        {rubricFailure && <Alert>{rubricFailure}</Alert>}
        <p>Total: {total} / 100 <span className={total !== 100 ? "rubric-total-invalid" : ""}>Còn lại: {100 - total}</span></p>
        {criteria.map((criterion, index) => <div className="form-grid" key={index}>
          <Field id={`rubric-title-${index}`} label="Criterion" value={criterion.title} onChange={(event) => updateCriterion(index, "title", event.target.value)} />
          <Field id={`rubric-score-${index}`} label="Points" type="number" min={1} max={100} value={criterion.maximum_score} onChange={(event) => updateCriterion(index, "maximum_score", event.target.value)} />
          <Button type="button" className="button-secondary" onClick={() => removeCriterion(index)}>Xóa</Button>
        </div>)}
        <div className="form-actions">
          <Button type="button" className="button-secondary" onClick={addCriterion}>Add criterion</Button>
          <Button type="button" className="button-secondary" onClick={splitEvenly}>Chia đều</Button>
          <Button type="button" className="button-secondary" onClick={useDefaultTemplate}>Dùng mẫu mặc định</Button>
        </div>
        <div className="dialog-actions">
          <Button type="button" className="button-secondary" disabled={busy} onClick={() => setRubricOpen(false)}>Cancel</Button>
          <Button type="submit" disabled={busy || total !== 100 || !criteria.length}>{busy ? "Saving…" : "Save rubric"}</Button>
        </div>
      </form>
    </Dialog>}
  </section>;
}
```

- [ ] **Step 4: Wire the route**

In `frontend/src/App.tsx`, add the import next to `TeacherClassPage`:

```tsx
import { TeacherAssignmentPage } from "./pages/teacher/TeacherAssignmentPage";
```

and add the route inside the `TEACHER` `RequireRole` block:

```tsx
      <Route element={<RequireRole roles={["TEACHER"]} />}>
        <Route path="/teacher/classes" element={<TeacherClassesPage />} />
        <Route path="/teacher/classes/:classId" element={<TeacherClassPage />} />
        <Route path="/teacher/classes/:classId/students/:studentId" element={<ClassStudentViewPage />} />
        <Route path="/teacher/assignments/:assignmentId" element={<TeacherAssignmentPage />} />
      </Route>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/test/pages/TeacherAssignmentPage.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/teacher/TeacherAssignmentPage.tsx frontend/src/App.tsx frontend/src/test/pages/TeacherAssignmentPage.test.tsx
git commit -m "feat(frontend): add teacher assignment detail page with rubric editor"
```

---

## Task 8: Frontend — Student Assignments tab

**Files:**
- Modify: `frontend/src/pages/student/StudentClassPage.tsx`
- Modify: `frontend/src/test/pages/StudentClassPage.test.tsx`

**Interfaces:**
- Consumes: `Assignment` type (Task 1), `classAssignmentsPath` (Task 2), `formatDateTime` (Task 3).
- Produces: the rendered student Assignments table. Every row links to `/student/assignments/{id}` (Task 9).

**Known scope limit (call this out, don't silently fabricate data):** `AssignmentSerializer` has no per-student score field — the doc's Điểm column value (`score/100`) can only be populated once doc 04 (Submissions/Grading) exists. This task renders `—` for every row's Điểm cell; that's a deliberate, documented gap, not an oversight.

- [ ] **Step 1: Write the failing test**

Replace the `it("renders a placeholder for the Assignments tab", ...)` test in `frontend/src/test/pages/StudentClassPage.test.tsx` with:

```ts
  it.each([
    ["OPEN", "Chưa nộp", "Nộp bài"],
    ["SUBMITTED", "Đã nộp", "Xem lịch sử"],
    ["GRADED", "Đã chấm", "Xem kết quả"],
  ] as const)("maps learning_state %s to the correct Trạng thái and action label", async (learningState, label, actionLabel) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail()))
      .mockResolvedValueOnce(json([{
        id: 1, classroom_id: 9, title: "Homework 1", description: "Build a small app.",
        due_at: "2026-08-15T20:00:00Z", maximum_score: 100, criteria: [], created_at: "2026-07-20T00:00:00Z",
        learning_state: learningState, deadline_badge: "Còn 3 ngày", closure_reason: null,
      }]));
    openPage(fetchMock);
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    await events.click(screen.getByRole("tab", { name: "Assignments" }));

    await waitFor(() => expect(screen.getByText("Homework 1")).toBeTruthy());
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText(actionLabel)).toBeTruthy();
  });

  it("shows closure_reason as a tooltip and no second action for CLOSED", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail()))
      .mockResolvedValueOnce(json([{
        id: 1, classroom_id: 9, title: "Homework 1", description: "Build a small app.",
        due_at: "2026-07-01T20:00:00Z", maximum_score: 100, criteria: [], created_at: "2026-06-20T00:00:00Z",
        learning_state: "CLOSED", deadline_badge: "Đã hết hạn", closure_reason: "Deadline has passed.",
      }]));
    openPage(fetchMock);
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    await events.click(screen.getByRole("tab", { name: "Assignments" }));

    await waitFor(() => expect(screen.getByText("Homework 1")).toBeTruthy());
    expect(screen.getByText("Đã đóng").getAttribute("title")).toBe("Deadline has passed.");
    expect(screen.queryByText("Nộp bài")).toBeNull();
    expect(screen.queryByText("Xem lịch sử")).toBeNull();
    expect(screen.queryByText("Xem kết quả")).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/test/pages/StudentClassPage.test.tsx`
Expected: FAIL — placeholder text still rendered.

- [ ] **Step 3: Implement the table**

Update imports in `frontend/src/pages/student/StudentClassPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Alert } from "../../components/Alert";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { EyeIcon, IconLinkButton } from "../../components/IconButton";
import { Spinner } from "../../components/Spinner";
import { Table } from "../../components/Table";
import { classAssignmentsPath, request } from "../../lib/api";
import { formatDate, formatDateTime } from "../../lib/format";
import type { Assignment, ClassRow } from "../../types";
```

Add, above the `StudentClassPage` function:

```tsx
const LEARNING_STATE_LABEL: Record<string, { label: string; action: string | null }> = {
  OPEN: { label: "Chưa nộp", action: "Nộp bài" },
  SUBMITTED: { label: "Đã nộp", action: "Xem lịch sử" },
  GRADED: { label: "Đã chấm", action: "Xem kết quả" },
  CLOSED: { label: "Đã đóng", action: null },
};
```

Inside the component, add state and loader:

```tsx
  const [assignments, setAssignments] = useState<Assignment[]>();
  const [assignmentsFailure, setAssignmentsFailure] = useState("");

  const loadAssignments = useCallback(() => {
    if (!classId) return;
    request<Assignment[]>(classAssignmentsPath(Number(classId)), { token: sessionStorage.getItem("access_token") ?? undefined })
      .then((value) => value && setAssignments(value))
      .catch(() => setAssignmentsFailure("Unable to load assignments."));
  }, [classId]);
  useEffect(() => { if (tab === "assignments") loadAssignments(); }, [loadAssignments, tab]);
```

Replace the placeholder line:

```tsx
    {tab === "assignments" && <Card><p className="muted">Assignments — see 03-assignments-and-rubrics / 04-submissions.</p></Card>}
```

with:

```tsx
    {tab === "assignments" && <Card>
      {assignmentsFailure && <Alert>{assignmentsFailure}</Alert>}
      {!assignments ? <Spinner label="Loading assignments" /> :
        assignments.length === 0 ? <EmptyState>No assignments.</EmptyState> :
          <Table><thead><tr><th>Tên</th><th>Hạn nộp</th><th>Trạng thái</th><th>Điểm</th><th>Action</th></tr></thead>
            <tbody>{assignments.map((assignment) => {
              const state = LEARNING_STATE_LABEL[assignment.learning_state ?? "CLOSED"];
              return <tr key={assignment.id}>
                <td>{assignment.title}</td>
                <td>{formatDateTime(assignment.due_at)}{assignment.deadline_badge && <><br /><span className="muted">{assignment.deadline_badge}</span></>}</td>
                <td title={assignment.learning_state === "CLOSED" ? assignment.closure_reason ?? undefined : undefined}>{state.label}</td>
                <td>—</td>
                <td><div className="row-actions">
                  <IconLinkButton to={`/student/assignments/${assignment.id}`} icon={<EyeIcon />} label="Xem" />
                  {state.action && <Link className="button button-secondary" to={`/student/assignments/${assignment.id}`}>{state.action}</Link>}
                </div></td>
              </tr>;
            })}</tbody>
          </Table>}
    </Card>}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/test/pages/StudentClassPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/student/StudentClassPage.tsx frontend/src/test/pages/StudentClassPage.test.tsx
git commit -m "feat(frontend): render the student Assignments tab table"
```

---

## Task 9: Frontend — Student assignment detail stub page

**Files:**
- Create: `frontend/src/pages/student/StudentAssignmentPage.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/test/pages/StudentAssignmentPage.test.tsx`

**Interfaces:**
- Consumes: nothing new (deliberately a stub — full implementation belongs to doc 04).
- Produces: route `/student/assignments/:assignmentId`, the target of every action button in Task 8's table.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/test/pages/StudentAssignmentPage.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { StudentAssignmentPage } from "../../pages/student/StudentAssignmentPage";

describe("Student assignment page", () => {
  it("renders a stub pointing at 04-submissions", () => {
    render(
      <MemoryRouter initialEntries={["/student/assignments/5"]}>
        <Routes>
          <Route path="/student/assignments/:assignmentId" element={<StudentAssignmentPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Assignment detail — see 04-submissions.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/test/pages/StudentAssignmentPage.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the stub page**

Create `frontend/src/pages/student/StudentAssignmentPage.tsx`:

```tsx
import { Link } from "react-router-dom";

import { Card } from "../../components/Card";

export function StudentAssignmentPage() {
  return <section className="page-stack">
    <Link className="back-link" to="/student/classes">‹ Back</Link>
    <Card><p className="muted">Assignment detail — see 04-submissions.</p></Card>
  </section>;
}
```

- [ ] **Step 4: Wire the route**

In `frontend/src/App.tsx`, add the import next to `StudentClassPage`:

```tsx
import { StudentAssignmentPage } from "./pages/student/StudentAssignmentPage";
```

and add the route inside the `STUDENT` `RequireRole` block:

```tsx
      <Route element={<RequireRole roles={["STUDENT"]} />}>
        <Route path="/student/classes" element={<StudentClassesPage />} />
        <Route path="/student/classes/:classId" element={<StudentClassPage />} />
        <Route path="/student/assignments/:assignmentId" element={<StudentAssignmentPage />} />
      </Route>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/test/pages/StudentAssignmentPage.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/student/StudentAssignmentPage.tsx frontend/src/App.tsx frontend/src/test/pages/StudentAssignmentPage.test.tsx
git commit -m "feat(frontend): add student assignment detail stub page and route"
```

---

## Task 10: Frontend verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full frontend test suite and typecheck**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 2: Run the frontend build**

Run: `cd frontend && npx vite build`
Expected: succeeds with no TypeScript/bundling errors.

- [ ] **Step 3: Manual smoke check (if a dev server is available)**

Start backend + frontend dev servers, log in as a teacher, open a class, switch to the Assignments tab, create an assignment, open it, edit its rubric with Chia đều / Dùng mẫu mặc định, then log in as an enrolled student and confirm the same assignment shows the correct Trạng thái/action per `learning_state`.

No commit for this task — it's a checkpoint, not a change.
