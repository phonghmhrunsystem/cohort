# Classes & Enrollment Completion Implementation Plan — Part B: Frontend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `backend/classes` and the frontend Classes screens up to spec in `docs/overview/02-classes-and-enrollment.md` — fix backend gaps/bugs (missing `PATCH .../status`, missing `is_open`, blocked teacher reassignment, missing pagination, unfiltered `is_active` scoping, incomplete roster payloads) and build the eight frontend pages that currently do not exist (`/classes/*` is a placeholder route today).

**Architecture:** Backend: extend the existing `classes` Django app (models/serializers/views/urls) in place — no new app. Frontend: mirror the existing Accounts vertical slice exactly (`AccountForm` → `ClassForm`, `AdminUsersPage` → `AdminClassesPage`, etc.) using the same `Field`/`Select`/`Table`/`Dialog`/`Badge`/`Card`/pagination/action-menu components already in `frontend/src/components/`. No new UI library, no new backend app — reuse only.

**Tech Stack:** Django REST (`APIView` + `rest_framework.serializers`), React 19 + TypeScript + Tailwind (no component kit), `react-router-dom`, Vitest, Django `manage.py test`.

## Global Constraints

- Backend tests: run **only** `backend/classes/tests/test_classes.py` (`python manage.py test classes.tests.test_classes -v 2` from `backend/`, or a single class with `classes.tests.test_classes.ClassApiTests`). Never run the full backend suite for this work — other apps' tests are out of scope.
- Frontend tests: `npm run test -- <path>` scoped to the new/changed test file(s) only (Vitest).
- Dates render `en-GB` (`dd/mm/yyyy`) via the existing `formatDate` helper in `frontend/src/pages/AdminUsersPage.tsx`.
- All new frontend pages reuse existing components (`Field`, `Select`, `Table`, `Dialog`, `Badge`, `Card`, `Button`, `Alert`, `Spinner`, `EmptyState`, `useToast`) — do not create new primitives.
- `422` is the server validation-failure status throughout this codebase (not `400`).
- Every admin-mutation gets a `write_audit(...)` call, matching the existing pattern in `classes/views.py`.

---

> **Companion doc:** Backend work is in [2026-07-30-classes-enrollment-completion-partA.md](2026-07-30-classes-enrollment-completion-partA.md).

## Part B — Frontend (`frontend/src/`)

All pages below reuse `frontend/src/components/{Field,Select,Table,Dialog,Badge,Card,Button,Alert,Spinner,EmptyState}.tsx` and the `useToast`/`request`/`ApiFailure` plumbing already used by the Accounts pages — do not add new primitives.

### Task 10: Types + API path helpers for classes

**Files:**
- Modify: `frontend/src/types.ts`, `frontend/src/lib/api.ts`

**Interfaces:**
- Produces: `ClassRow`, `ClassDetail`, `ClassFilters`, `ClassCreatePayload`, `ClassUpdatePayload`, `RosterStudent`, `RosterFilters` types; `classesPath(filters)`, `classStudentsPath(id, filters)` helpers — consumed by every page task below.

- [ ] **Step 1: Add types**

`frontend/src/types.ts` — append:

```typescript
export interface ClassRow {
  id: number;
  name: string;
  description: string;
  teacher: { id: number; full_name: string; email: string };
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  student_count: number;
  assignment_count: number | null;
  graded_count: number | null;
  next_due_at: string | null;
}

export interface ClassFilters {
  q?: string;
  teacher?: string;
  page?: number;
}

export interface ClassFormPayload {
  name: string;
  description: string;
  starts_at: string;
  ends_at: string;
  teacher_id: number;
}

export interface RosterStudent {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  hometown: string | null;
  is_active: boolean;
  enrolled_at: string;
  submitted_assignments: number;
  graded_assignments: number;
}

export interface RosterResponse {
  total_assignments: number;
  enrolled_students: number;
  submitted_students: number;
  graded_students: number;
  students: Page<RosterStudent>;
}

export interface Candidate {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  hometown: string | null;
  is_active: boolean;
}
```

- [ ] **Step 2: Add path helpers**

`frontend/src/lib/api.ts` — append, mirroring `usersPath` (lines 39-46):

```typescript
export function classesPath(filters: ClassFilters = {}): string {
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return query.size ? `/classes?${query}` : "/classes";
}

export function classStudentsPath(classId: number, filters: { q?: string; page?: number } = {}): string {
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return query.size ? `/classes/${classId}/students?${query}` : `/classes/${classId}/students`;
}
```

Add `import type { ClassFilters } from "../types";` to the top of `api.ts`.

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors (types are additive-only at this point, nothing consumes them yet).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/lib/api.ts
git commit -m "feat(frontend): add Classes API types and path helpers"
```

---

### Task 11: `ClassForm` shared component

**Files:**
- Create: `frontend/src/components/ClassForm.tsx`
- Test: `frontend/src/test/components/ClassForm.test.ts`

**Interfaces:**
- Produces: `ClassFormValue`, `classFormValue(class_?)`, `classFormPayload(value)`, `classFormErrors(value)`, `<ClassForm value onChange errors prefix teachers />` — consumed by Task 12 (create) and Task 14 (edit).
- Consumes: `Field`/`Select` from `./Field`, a `teachers: { id: number; full_name: string }[]` list passed in by the caller (fetched via `GET /users?role=TEACHER` — reuse the existing accounts endpoint, no new backend call needed).

- [ ] **Step 1: Write the failing test**

`frontend/src/test/components/ClassForm.test.ts` (mirror `AccountForm.test.ts`'s structure — read it first for the exact assertion style used in this repo):

```typescript
import { describe, expect, it } from "vitest";
import { classFormErrors, classFormPayload, classFormValue } from "../../components/ClassForm";

describe("classFormValue", () => {
  it("defaults to empty fields", () => {
    expect(classFormValue()).toEqual({ name: "", description: "", starts_at: "", ends_at: "", teacher_id: "" });
  });
});

describe("classFormErrors", () => {
  it("requires a name between 2 and 100 characters", () => {
    expect(classFormErrors({ name: "A", description: "", starts_at: "2026-01-01", ends_at: "2026-02-01", teacher_id: "1" }).name).toBeDefined();
  });
  it("requires starts_at before ends_at", () => {
    expect(classFormErrors({ name: "Cohort 5", description: "", starts_at: "2026-02-01", ends_at: "2026-01-01", teacher_id: "1" }).ends_at).toBeDefined();
  });
  it("requires a teacher", () => {
    expect(classFormErrors({ name: "Cohort 5", description: "", starts_at: "2026-01-01", ends_at: "2026-02-01", teacher_id: "" }).teacher_id).toBeDefined();
  });
});

describe("classFormPayload", () => {
  it("trims text and coerces teacher_id to a number", () => {
    expect(classFormPayload({ name: " Cohort 5 ", description: " desc ", starts_at: "2026-01-01", ends_at: "2026-02-01", teacher_id: "3" }))
      .toEqual({ name: "Cohort 5", description: "desc", starts_at: "2026-01-01", ends_at: "2026-02-01", teacher_id: 3 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/test/components/ClassForm.test.ts`
Expected: FAIL — `../../components/ClassForm` module not found.

- [ ] **Step 3: Implement**

`frontend/src/components/ClassForm.tsx`:

```typescript
import type { ClassFormPayload, ClassRow, FieldErrors } from "../types";
import { Field, Select } from "./Field";

export type ClassFormValue = {
  name: string;
  description: string;
  starts_at: string;
  ends_at: string;
  teacher_id: string;
};

export const classFormValue = (class_?: ClassRow): ClassFormValue => ({
  name: class_?.name ?? "",
  description: class_?.description ?? "",
  starts_at: class_?.starts_at?.slice(0, 10) ?? "",
  ends_at: class_?.ends_at?.slice(0, 10) ?? "",
  teacher_id: class_ ? String(class_.teacher.id) : "",
});

export const classFormPayload = (value: ClassFormValue): ClassFormPayload => ({
  name: value.name.trim(),
  description: value.description.trim(),
  starts_at: value.starts_at,
  ends_at: value.ends_at,
  teacher_id: Number(value.teacher_id),
});

export function classFormErrors(value: ClassFormValue): FieldErrors {
  const errors: FieldErrors = {};
  const name = value.name.trim();
  if (!name) errors.name = ["Name is required."];
  else if (name.length < 2 || name.length > 100) errors.name = ["Use 2 to 100 characters."];
  if (!value.starts_at) errors.starts_at = ["Start date is required."];
  if (!value.ends_at) errors.ends_at = ["End date is required."];
  if (value.starts_at && value.ends_at && value.starts_at >= value.ends_at) errors.ends_at = ["End time must be after start time."];
  if (!value.teacher_id) errors.teacher_id = ["Teacher is required."];
  return errors;
}

export function ClassForm({
  value, onChange, errors = {}, prefix = "class", teachers,
}: {
  value: ClassFormValue;
  onChange: (value: ClassFormValue) => void;
  errors?: FieldErrors;
  prefix?: string;
  teachers: { id: number; full_name: string }[];
}) {
  const set = <K extends keyof ClassFormValue>(field: K, next: ClassFormValue[K]) => onChange({ ...value, [field]: next });
  return <fieldset className="form-section">
    <legend className="section-title">Class details</legend>
    <div className="form-grid">
      <Field id={`${prefix}-name`} label="Name" required wide maxLength={100} value={value.name} onChange={(event) => set("name", event.target.value)} error={errors.name?.[0]} />
      <Field id={`${prefix}-description`} label="Description" wide value={value.description} onChange={(event) => set("description", event.target.value)} error={errors.description?.[0]} />
      <Field id={`${prefix}-starts-at`} label="Starts" type="date" required value={value.starts_at} onChange={(event) => set("starts_at", event.target.value)} error={errors.starts_at?.[0]} />
      <Field id={`${prefix}-ends-at`} label="Ends" type="date" required value={value.ends_at} onChange={(event) => set("ends_at", event.target.value)} error={errors.ends_at?.[0]} />
      <Select id={`${prefix}-teacher`} label="Teacher" required wide value={value.teacher_id} onChange={(event) => set("teacher_id", event.target.value)} error={errors.teacher_id?.[0]}>
        <option value="">Select a teacher</option>
        {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}
      </Select>
    </div>
  </fieldset>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/test/components/ClassForm.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ClassForm.tsx frontend/src/test/components/ClassForm.test.ts
git commit -m "feat(frontend): add shared ClassForm component"
```

---

### Task 12: `AdminClassesPage` (list, filters, pagination, status toggle)

**Files:**
- Create: `frontend/src/pages/AdminClassesPage.tsx`
- Test: `frontend/src/test/pages/AdminClassesPage.test.tsx`

**Interfaces:**
- Consumes: `classesPath` (Task 10), `Table`/`Badge`/`Card`/`Dialog`/`Button`/`Field`/`Spinner`/`Alert`/`EmptyState`, `useToast`, `formatDate` (exported from `AdminUsersPage.tsx`).
- Produces: mounted at `/admin/classes` (wired in Task 18).

- [ ] **Step 1: Write the failing test**

Read `frontend/src/test/pages/AdminUsersPage.test.tsx` first for this repo's page-test conventions (mock `fetch`, render with `MemoryRouter`, assert on rendered rows and interactions), then write `frontend/src/test/pages/AdminClassesPage.test.tsx` following the same shape with at minimum:

```typescript
it("renders classes with student count and status badge", async () => { /* mock GET /api/classes -> paginated ClassRow[], assert table cells */ });
it("searches only when the Search button is clicked", async () => { /* type into name/teacher filters, assert no fetch until submit */ });
it("disables the Disable action once the class has started", async () => { /* row with starts_at in the past -> menu item disabled with tooltip */ });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/test/pages/AdminClassesPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`frontend/src/pages/AdminClassesPage.tsx` (mirrors `AdminUsersPage.tsx` structure exactly — filters-on-submit, `PageNumberPagination` envelope, per-row `:` menu):

```typescript
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { Alert } from "../components/Alert";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { Field } from "../components/Field";
import { Spinner } from "../components/Spinner";
import { Table } from "../components/Table";
import { useToast } from "../components/Toast";
import { classesPath, request } from "../lib/api";
import type { ClassFilters, ClassRow, Page } from "../types";
import { formatDate } from "./AdminUsersPage";

const token = () => sessionStorage.getItem("access_token") ?? undefined;

export function AdminClassesPage() {
  const [draft, setDraft] = useState<ClassFilters>({});
  const [submitted, setSubmitted] = useState<ClassFilters>({});
  const [pageNumber, setPageNumber] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<Page<ClassRow>>();
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [confirmation, setConfirmation] = useState<ClassRow>();
  const [busy, setBusy] = useState(false);
  const requestGeneration = useRef(0);
  const toast = useToast();

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true); setFailure("");
    try {
      const result = await request<Page<ClassRow>>(classesPath({ ...submitted, page: pageNumber === 1 ? undefined : pageNumber }), { token: token() });
      if (generation === requestGeneration.current && result) setData(result);
    } catch (error) {
      if (generation === requestGeneration.current) setFailure(error instanceof Error ? error.message : "Unable to load classes.");
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [submitted, pageNumber, refreshKey]);

  useEffect(() => { void load(); }, [load]);
  const refresh = () => setRefreshKey((value) => value + 1);
  const search = (event: FormEvent) => { event.preventDefault(); setPageNumber(1); setSubmitted({ ...draft }); };
  const field = (name: keyof ClassFilters, value: string) => setDraft({ ...draft, [name]: value || undefined });

  const canDisable = (row: ClassRow) => new Date(row.starts_at) > new Date();

  async function toggleStatus() {
    if (!confirmation) return;
    setBusy(true);
    try {
      await request(`/classes/${confirmation.id}/status`, { method: "PATCH", token: token(), body: { is_active: !confirmation.is_active } });
      toast.success(confirmation.is_active ? `Disabled ${confirmation.name}.` : `Enabled ${confirmation.name}.`);
      setConfirmation(undefined); refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update class.");
    } finally { setBusy(false); }
  }

  return <section className="page-stack">
    <div className="page-header"><div><h1>Classes</h1></div>
      <Link className="button" to="/admin/classes/new">Create Class</Link>
    </div>
    <Card><form className="filters" noValidate onSubmit={search}>
      <div className="filters-row filters-search">
        <div className="filters-primary">
          <Field id="class-search-name" label="Class name" value={draft.q ?? ""} onChange={(event) => field("q", event.target.value)} />
          <Field id="class-search-teacher" label="Teacher name" value={draft.teacher ?? ""} onChange={(event) => field("teacher", event.target.value)} />
        </div>
        <Button type="submit">Search</Button>
      </div>
    </form></Card>
    {loading && !data ? <Spinner label="Loading classes" /> : failure ? <Alert>{failure} <button onClick={() => void load()}>Retry</button></Alert> :
      data?.results.length === 0 ? <EmptyState>No classes found.</EmptyState> :
        data && <><Table><thead><tr><th>Name</th><th>Teacher</th><th>Starts</th><th>Ends</th><th>Students</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{data.results.map((row) => <tr key={row.id}>
            <td>{row.name}</td><td>{row.teacher.full_name}</td><td>{formatDate(row.starts_at)}</td><td>{formatDate(row.ends_at)}</td><td>{row.student_count}</td>
            <td><Badge className={row.is_active ? "badge-active" : "badge-disabled"}>{row.is_active ? "Active" : "Disabled"}</Badge></td>
            <td>
              <Link to={`/admin/classes/${row.id}`}>View</Link>{" "}
              <button disabled={row.is_active && !canDisable(row)} title={row.is_active && !canDisable(row) ? "Class has already started." : undefined} onClick={() => setConfirmation(row)}>
                {row.is_active ? "Disable" : "Enable"}
              </button>
            </td>
          </tr>)}</tbody>
        </Table><nav className="pagination" aria-label="Classes pagination"><button disabled={!data.previous} aria-label="Previous page" onClick={() => setPageNumber((value) => value - 1)}>Previous</button><span>Page {pageNumber}</span><button disabled={!data.next} aria-label="Next page" onClick={() => setPageNumber((value) => value + 1)}>Next</button></nav></>}
    {confirmation && <Dialog open onClose={() => setConfirmation(undefined)} title={confirmation.is_active ? "Disable class" : "Enable class"}>
      <p>{confirmation.is_active ? `Disable ${confirmation.name}? Students and the teacher will lose access.` : `Enable ${confirmation.name}?`}</p>
      <div className="dialog-actions">
        <Button className="button-secondary" disabled={busy} onClick={() => setConfirmation(undefined)}>Cancel</Button>
        <Button className={confirmation.is_active ? "button-danger" : ""} disabled={busy} onClick={() => void toggleStatus()}>{confirmation.is_active ? "Disable" : "Enable"}</Button>
      </div>
    </Dialog>}
  </section>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/test/pages/AdminClassesPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AdminClassesPage.tsx frontend/src/test/pages/AdminClassesPage.test.tsx
git commit -m "feat(frontend): add AdminClassesPage list with filters, pagination, status toggle"
```

---

### Task 13: `AdminClassCreatePage`

**Files:**
- Create: `frontend/src/pages/AdminClassCreatePage.tsx`
- Test: `frontend/src/test/pages/AdminClassCreatePage.test.tsx`

**Interfaces:**
- Consumes: `ClassForm`/`classFormValue`/`classFormPayload`/`classFormErrors` (Task 11); fetches teacher options via `GET /users?role=TEACHER` (existing endpoint, `Page<User>` — filter to `is_active` in the request).

- [ ] **Step 1: Write the failing test**

Mirror `AdminUserCreatePage`'s test conventions: mock the teacher list fetch and the `POST /api/classes` call, assert client-side validation blocks submit on empty name, assert successful submit navigates to `/admin/classes/{id}`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/test/pages/AdminClassCreatePage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`frontend/src/pages/AdminClassCreatePage.tsx`:

```typescript
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ClassForm, classFormErrors, classFormPayload, classFormValue, type ClassFormValue } from "../components/ClassForm";
import { request, usersPath } from "../lib/api";
import { ApiFailure } from "../lib/errors";
import type { ClassRow, FieldErrors, Page, User } from "../types";

export function AdminClassCreatePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ClassFormValue>(classFormValue());
  const [teachers, setTeachers] = useState<{ id: number; full_name: string }[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const token = () => sessionStorage.getItem("access_token") ?? undefined;

  useEffect(() => {
    request<Page<User>>(usersPath({ role: "TEACHER" }), { token: token() })
      .then((page) => setTeachers((page?.results ?? []).filter((user) => user.is_active)));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setFailure("");
    const invalid = classFormErrors(draft);
    if (Object.keys(invalid).length) return setErrors(invalid);
    setErrors({}); setBusy(true);
    try {
      const created = await request<ClassRow>("/classes", { method: "POST", token: token(), body: classFormPayload(draft) });
      if (created) navigate(`/admin/classes/${created.id}`);
    } catch (error) {
      if (error instanceof ApiFailure && error.fields) setErrors(error.fields);
      else setFailure(error instanceof Error ? error.message : "Unable to create class.");
    } finally { setBusy(false); }
  }

  return <section className="page-stack">
    <div className="page-header"><h1>Create Class</h1></div>
    <Card><form noValidate onSubmit={save}>
      {failure && <Alert>{failure}</Alert>}
      <ClassForm prefix="create" value={draft} onChange={setDraft} errors={errors} teachers={teachers} />
      <div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</Button><Link to="/admin/classes">Cancel</Link></div>
    </form></Card>
  </section>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/test/pages/AdminClassCreatePage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AdminClassCreatePage.tsx frontend/src/test/pages/AdminClassCreatePage.test.tsx
git commit -m "feat(frontend): add AdminClassCreatePage"
```

---

### Task 14: `AdminClassViewPage` (detail + roster + Edit roster dialog + student sub-view)

**Files:**
- Create: `frontend/src/pages/AdminClassViewPage.tsx`, `frontend/src/pages/AdminClassStudentViewPage.tsx`
- Test: `frontend/src/test/pages/AdminClassViewPage.test.tsx`

**Interfaces:**
- Consumes: `classStudentsPath` (Task 10), `Info` component (exported from `AdminUserViewPage.tsx`), `RosterResponse`/`RosterStudent`/`Candidate` types (Task 10).
- Produces: routes `/admin/classes/{id}` and `/admin/classes/{id}/students/{student_id}` (wired Task 18).

- [ ] **Step 1: Write the failing test**

Mirror `AdminUserViewPage` conventions: mock `GET /api/classes/{id}` and `GET /api/classes/{id}/students`, assert the Class detail fields, roster table columns (Name/Quê quán/Phone/Enrolled/Action), that `Remove` is hidden for a row whose `submitted_assignments > 0`, and that opening "Edit roster" then saving calls `PUT /api/classes/{id}/enrollments`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/test/pages/AdminClassViewPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`frontend/src/pages/AdminClassViewPage.tsx`:

```typescript
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { Alert } from "../components/Alert";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { Field } from "../components/Field";
import { Spinner } from "../components/Spinner";
import { Table } from "../components/Table";
import { useToast } from "../components/Toast";
import { classStudentsPath, request } from "../lib/api";
import { ApiFailure } from "../lib/errors";
import type { Candidate, ClassRow, Page, RosterResponse, RosterStudent } from "../types";
import { formatDate } from "./AdminUsersPage";
import { Info } from "./AdminUserViewPage";

const token = () => sessionStorage.getItem("access_token") ?? undefined;

export function AdminClassViewPage() {
  const { classId } = useParams();
  const id = Number(classId);
  const [class_, setClass] = useState<ClassRow>();
  const [roster, setRoster] = useState<RosterResponse>();
  const [rosterQuery, setRosterQuery] = useState("");
  const [rosterSubmitted, setRosterSubmitted] = useState("");
  const [rosterPage, setRosterPage] = useState(1);
  const [failure, setFailure] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const loadClass = useCallback(() => {
    request<ClassRow>(`/classes/${id}`, { token: token() })
      .then((value) => value && setClass(value))
      .catch((error) => setFailure(error instanceof ApiFailure && error.status === 404 ? "Class not found." : "Unable to load class."));
  }, [id]);

  const loadRoster = useCallback(() => {
    request<RosterResponse>(classStudentsPath(id, { q: rosterSubmitted || undefined, page: rosterPage === 1 ? undefined : rosterPage }), { token: token() })
      .then((value) => value && setRoster(value));
  }, [id, rosterSubmitted, rosterPage]);

  useEffect(() => { loadClass(); }, [loadClass]);
  useEffect(() => { loadRoster(); }, [loadRoster]);

  const search = (event: FormEvent) => { event.preventDefault(); setRosterPage(1); setRosterSubmitted(rosterQuery); };

  async function removeStudent(studentId: number) {
    try {
      await request(`/classes/${id}/enrollments/${studentId}`, { method: "DELETE", token: token() });
      toast.success("Removed from roster.");
      loadRoster();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove student.");
    }
  }

  async function openEditRoster() {
    setEditOpen(true);
    setSelected(new Set((roster?.students.results ?? []).map((s) => s.id)));
    const all = await request<{ results?: Candidate[] } | Candidate[]>(`/classes/${id}/students?candidates=1`, { token: token() });
    setCandidates(Array.isArray(all) ? all : all?.results ?? []);
  }

  async function saveRoster() {
    setBusy(true);
    try {
      await request(`/classes/${id}/enrollments`, { method: "PUT", token: token(), body: { student_ids: Array.from(selected) } });
      toast.success("Roster updated.");
      setEditOpen(false); loadRoster();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save roster.");
    } finally { setBusy(false); }
  }

  if (failure) return <Alert>{failure}</Alert>;
  if (!class_) return <Spinner label="Loading class" />;
  const ended = new Date(class_.ends_at) <= new Date();
  const visibleCandidates = candidates.filter((c) => c.full_name.toLowerCase().includes(candidateQuery.toLowerCase()) || c.email.toLowerCase().includes(candidateQuery.toLowerCase()));

  return <section className="page-stack">
    <div className="page-header"><h1>Class Detail</h1><Link className="button" to={`/admin/classes/${id}/edit`}>Edit Class</Link></div>
    <Card><h2 className="section-title">Class details</h2><dl className="identity-grid">
      <Info label="Name" value={class_.name} />
      <Info label="Description" value={class_.description} wide />
      <Info label="Teacher" value={class_.teacher.full_name} />
      <Info label="Starts" value={formatDate(class_.starts_at)} />
      <Info label="Ends" value={formatDate(class_.ends_at)} />
      <Info label="Status" value={<Badge className={class_.is_active ? "badge-active" : "badge-disabled"}>{class_.is_active ? "Active" : "Disabled"}</Badge>} />
    </dl></Card>

    {roster && <Card>
      <div className="page-header"><h2 className="section-title">Students ({roster.enrolled_students})</h2>{!ended && <Button onClick={() => void openEditRoster()}>Edit roster</Button>}</div>
      <form className="filters" noValidate onSubmit={search}><Field id="roster-search" label="Search Students" value={rosterQuery} onChange={(event) => setRosterQuery(event.target.value)} /><Button type="submit">Search</Button></form>
      {roster.students.results.length === 0 ? <EmptyState>No students enrolled.</EmptyState> : <><Table><thead><tr><th>Name</th><th>Quê quán</th><th>Phone</th><th>Enrolled</th><th>Action</th></tr></thead>
        <tbody>{roster.students.results.map((student) => <tr key={student.id}>
          <td>{student.full_name}</td><td>{student.hometown || "—"}</td><td>{student.phone || "—"}</td><td>{formatDate(student.enrolled_at)}</td>
          <td><Link to={`/admin/classes/${id}/students/${student.id}`}>View</Link>{" "}
            {!ended && student.submitted_assignments === 0 && <button onClick={() => void removeStudent(student.id)}>Remove</button>}
          </td>
        </tr>)}</tbody>
      </Table><nav className="pagination" aria-label="Students pagination"><button disabled={!roster.students.previous} onClick={() => setRosterPage((v) => v - 1)}>Previous</button><span>Page {rosterPage}</span><button disabled={!roster.students.next} onClick={() => setRosterPage((v) => v + 1)}>Next</button></nav></>}
    </Card>}

    <Link to="/admin/classes">Back to classes</Link>

    {editOpen && <Dialog open onClose={() => setEditOpen(false)} title="Edit roster">
      <Field id="candidate-search" label="Search Students" value={candidateQuery} onChange={(event) => setCandidateQuery(event.target.value)} />
      <ul className="checkbox-list">{visibleCandidates.map((c) => <li key={c.id}>
        <label><input type="checkbox" checked={selected.has(c.id)} onChange={(event) => {
          const next = new Set(selected);
          if (event.target.checked) next.add(c.id); else next.delete(c.id);
          setSelected(next);
        }} /> {c.full_name} ({c.email})</label>
      </li>)}</ul>
      <div className="dialog-actions">
        <Button className="button-secondary" disabled={busy} onClick={() => setEditOpen(false)}>Cancel</Button>
        <Button disabled={busy} onClick={() => void saveRoster()}>{busy ? "Saving…" : "Save roster"}</Button>
      </div>
    </Dialog>}
  </section>;
}
```

`frontend/src/pages/AdminClassStudentViewPage.tsx` (read-only profile + per-Class progress, route `/admin/classes/{id}/students/{student_id}`):

```typescript
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Alert } from "../components/Alert";
import { Card } from "../components/Card";
import { Spinner } from "../components/Spinner";
import { request } from "../lib/api";
import { Info } from "./AdminUserViewPage";

interface StudentDetail {
  full_name: string; email: string; phone: string | null; hometown: string | null;
  submitted_assignments: number; graded_assignments: number; total_assignments: number;
}

export function AdminClassStudentViewPage() {
  const { classId, studentId } = useParams();
  const [student, setStudent] = useState<StudentDetail>();
  const [failure, setFailure] = useState("");
  useEffect(() => {
    request<StudentDetail>(`/classes/${classId}/students/${studentId}`, { token: sessionStorage.getItem("access_token") ?? undefined })
      .then((value) => value && setStudent(value))
      .catch((error) => setFailure(error instanceof Error ? error.message : "Unable to load student."));
  }, [classId, studentId]);
  if (failure) return <Alert>{failure}</Alert>;
  if (!student) return <Spinner label="Loading student" />;
  return <section className="page-stack">
    <div className="page-header"><h1>{student.full_name}</h1></div>
    <Card><dl className="identity-grid">
      <Info label="Email" value={student.email} />
      <Info label="Phone" value={student.phone} />
      <Info label="Quê quán" value={student.hometown} />
      <Info label="Progress" value={`${student.graded_assignments}/${student.total_assignments} graded, ${student.submitted_assignments} submitted`} />
    </dl></Card>
    <Link to={`/admin/classes/${classId}`}>Back to class</Link>
  </section>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/test/pages/AdminClassViewPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AdminClassViewPage.tsx frontend/src/pages/AdminClassStudentViewPage.tsx frontend/src/test/pages/AdminClassViewPage.test.tsx
git commit -m "feat(frontend): add AdminClassViewPage with roster, edit-roster dialog, student profile"
```

---

### Task 15: `AdminClassEditPage`

**Files:**
- Create: `frontend/src/pages/AdminClassEditPage.tsx`
- Test: `frontend/src/test/pages/AdminClassEditPage.test.tsx`

**Interfaces:**
- Consumes: `ClassForm` (Task 11), same teacher-fetch pattern as Task 13.

- [ ] **Step 1: Write the failing test**

Mirror `AdminUserEditPage` conventions: mock `GET /api/classes/{id}` + teacher list, assert fields prefill, assert `PATCH /api/classes/{id}` on save, assert navigation to `/admin/classes/{id}`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/test/pages/AdminClassEditPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`frontend/src/pages/AdminClassEditPage.tsx`:

```typescript
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ClassForm, classFormErrors, classFormPayload, classFormValue, type ClassFormValue } from "../components/ClassForm";
import { Spinner } from "../components/Spinner";
import { request, usersPath } from "../lib/api";
import { ApiFailure } from "../lib/errors";
import type { ClassRow, FieldErrors, Page, User } from "../types";

export function AdminClassEditPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [class_, setClass] = useState<ClassRow>();
  const [draft, setDraft] = useState<ClassFormValue>();
  const [teachers, setTeachers] = useState<{ id: number; full_name: string }[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const token = () => sessionStorage.getItem("access_token") ?? undefined;

  useEffect(() => {
    request<ClassRow>(`/classes/${classId}`, { token: token() })
      .then((value) => { if (value) { setClass(value); setDraft(classFormValue(value)); } })
      .catch((error) => setFailure(error instanceof ApiFailure && error.status === 404 ? "Class not found." : "Unable to load class."));
    request<Page<User>>(usersPath({ role: "TEACHER" }), { token: token() })
      .then((page) => setTeachers((page?.results ?? []).filter((user) => user.is_active)));
  }, [classId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setFailure("");
    const invalid = classFormErrors(draft);
    if (Object.keys(invalid).length) return setErrors(invalid);
    setErrors({}); setBusy(true);
    try {
      await request(`/classes/${classId}`, { method: "PATCH", token: token(), body: classFormPayload(draft) });
      navigate(`/admin/classes/${classId}`);
    } catch (error) {
      if (error instanceof ApiFailure && error.fields) setErrors(error.fields);
      else setFailure(error instanceof Error ? error.message : "Unable to save class.");
    } finally { setBusy(false); }
  }

  if (failure && !class_) return <Alert>{failure}</Alert>;
  if (!class_ || !draft) return <Spinner label="Loading class" />;
  return <section className="page-stack">
    <div className="page-header"><h1>Edit Class</h1></div>
    <Card><form noValidate onSubmit={save}>
      {failure && <Alert>{failure}</Alert>}
      <ClassForm prefix="edit" value={draft} onChange={setDraft} errors={errors} teachers={teachers} />
      <div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button><Link to={`/admin/classes/${classId}`}>Cancel</Link></div>
    </form></Card>
  </section>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/test/pages/AdminClassEditPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AdminClassEditPage.tsx frontend/src/test/pages/AdminClassEditPage.test.tsx
git commit -m "feat(frontend): add AdminClassEditPage"
```

---

### Task 16: `TeacherClassesPage` + `TeacherClassPage` (Students tab)

**Files:**
- Create: `frontend/src/pages/TeacherClassesPage.tsx`, `frontend/src/pages/TeacherClassPage.tsx`
- Test: `frontend/src/test/pages/TeacherClassesPage.test.tsx`, `frontend/src/test/pages/TeacherClassPage.test.tsx`

**Interfaces:**
- `TeacherClassPage`'s Assignments tab and "Bảng điểm" link are out of scope for this plan (owned by `03-assignments-and-rubrics.md` / `06-gradebook.md`) — render the Students tab fully and a disabled/placeholder `Assignments` tab button so the tab strip matches §2.4 without implementing assignment content here.

- [ ] **Step 1: Write the failing tests**

`TeacherClassesPage.test.tsx`: mock `GET /api/classes` (teacher-scoped, already filtered server-side to `teacher=me, is_active=true`), assert Name/Students/Action columns and `View` link.

`TeacherClassPage.test.tsx`: mock `GET /api/classes/{id}` and `GET /api/classes/{id}/students`, assert the three header counts render from the roster response's `enrolled_students`/`submitted_students`/`graded_students` (not recomputed from the visible rows), assert search narrows the table without changing the header counts.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- src/test/pages/TeacherClassesPage.test.tsx src/test/pages/TeacherClassPage.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`frontend/src/pages/TeacherClassesPage.tsx`:

```typescript
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { Alert } from "../components/Alert";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { Field } from "../components/Field";
import { Button } from "../components/Button";
import { Spinner } from "../components/Spinner";
import { Table } from "../components/Table";
import { classesPath, request } from "../lib/api";
import type { ClassRow, Page } from "../types";

export function TeacherClassesPage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [data, setData] = useState<Page<ClassRow>>();
  const [failure, setFailure] = useState("");
  const token = () => sessionStorage.getItem("access_token") ?? undefined;

  const load = useCallback(() => {
    request<Page<ClassRow>>(classesPath({ q: submitted || undefined, page: pageNumber === 1 ? undefined : pageNumber }), { token: token() })
      .then((value) => value && setData(value))
      .catch((error) => setFailure(error instanceof Error ? error.message : "Unable to load classes."));
  }, [submitted, pageNumber]);
  useEffect(() => { load(); }, [load]);
  const search = (event: FormEvent) => { event.preventDefault(); setPageNumber(1); setSubmitted(query); };

  return <section className="page-stack">
    <div className="page-header"><h1>My Classes</h1></div>
    <Card><form className="filters" noValidate onSubmit={search}><Field id="teacher-class-search" label="Search Classes" value={query} onChange={(event) => setQuery(event.target.value)} /><Button type="submit">Search</Button></form></Card>
    {failure ? <Alert>{failure}</Alert> : !data ? <Spinner label="Loading classes" /> :
      data.results.length === 0 ? <EmptyState>No classes assigned.</EmptyState> : <><Table><thead><tr><th>Name</th><th>Students</th><th>Action</th></tr></thead>
        <tbody>{data.results.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.student_count}</td><td><Link to={`/teacher/classes/${row.id}`}>View</Link></td></tr>)}</tbody>
      </Table><nav className="pagination" aria-label="Classes pagination"><button disabled={!data.previous} onClick={() => setPageNumber((v) => v - 1)}>Previous</button><span>Page {pageNumber}</span><button disabled={!data.next} onClick={() => setPageNumber((v) => v + 1)}>Next</button></nav></>}
  </section>;
}
```

`frontend/src/pages/TeacherClassPage.tsx`:

```typescript
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { Field } from "../components/Field";
import { Spinner } from "../components/Spinner";
import { Table } from "../components/Table";
import { classStudentsPath, request } from "../lib/api";
import type { ClassRow, RosterResponse } from "../types";

export function TeacherClassPage() {
  const { classId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "assignments" ? "assignments" : "students";
  const [class_, setClass] = useState<ClassRow>();
  const [roster, setRoster] = useState<RosterResponse>();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [failure, setFailure] = useState("");
  const token = () => sessionStorage.getItem("access_token") ?? undefined;

  useEffect(() => {
    request<ClassRow>(`/classes/${classId}`, { token: token() }).then((value) => value && setClass(value)).catch(() => setFailure("Unable to load class."));
  }, [classId]);

  const loadRoster = useCallback(() => {
    if (!classId) return;
    request<RosterResponse>(classStudentsPath(Number(classId), { q: submitted || undefined, page: pageNumber === 1 ? undefined : pageNumber }), { token: token() })
      .then((value) => value && setRoster(value));
  }, [classId, submitted, pageNumber]);
  useEffect(() => { if (tab === "students") loadRoster(); }, [loadRoster, tab]);

  const search = (event: FormEvent) => { event.preventDefault(); setPageNumber(1); setSubmitted(query); };

  if (failure) return <Alert>{failure}</Alert>;
  if (!class_) return <Spinner label="Loading class" />;
  return <section className="page-stack">
    <Link to="/teacher/classes">‹ Back</Link>
    <h1>{class_.name}</h1>
    <div className="tabs" role="tablist">
      <button role="tab" aria-selected={tab === "students"} onClick={() => setSearchParams({ tab: "students" })}>Students</button>
      <button role="tab" aria-selected={tab === "assignments"} onClick={() => setSearchParams({ tab: "assignments" })}>Assignments</button>
    </div>
    {tab === "students" && roster && <Card>
      <p>Đã ghi danh {roster.enrolled_students} · Đã nộp {roster.submitted_students} · Đã chấm {roster.graded_students}</p>
      <form className="filters" noValidate onSubmit={search}><Field id="teacher-roster-search" label="Search Student" value={query} onChange={(event) => setQuery(event.target.value)} /><Button type="submit">Search</Button></form>
      {roster.students.results.length === 0 ? <EmptyState>No students.</EmptyState> : <><Table><thead><tr><th>Name</th><th>Phone</th><th>Action</th></tr></thead>
        <tbody>{roster.students.results.map((s) => <tr key={s.id}><td>{s.full_name}</td><td>{s.phone || "—"}</td><td><Link to={`/teacher/classes/${classId}/students/${s.id}`}>View</Link></td></tr>)}</tbody>
      </Table><nav className="pagination" aria-label="Students pagination"><button disabled={!roster.students.previous} onClick={() => setPageNumber((v) => v - 1)}>Previous</button><span>Page {pageNumber}</span><button disabled={!roster.students.next} onClick={() => setPageNumber((v) => v + 1)}>Next</button></nav></>}
    </Card>}
    {tab === "assignments" && <Card><p className="muted">Assignments — see 03-assignments-and-rubrics.</p></Card>}
  </section>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- src/test/pages/TeacherClassesPage.test.tsx src/test/pages/TeacherClassPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/TeacherClassesPage.tsx frontend/src/pages/TeacherClassPage.tsx frontend/src/test/pages/TeacherClassesPage.test.tsx frontend/src/test/pages/TeacherClassPage.test.tsx
git commit -m "feat(frontend): add TeacherClassesPage and TeacherClassPage Students tab"
```

---

### Task 17: `StudentClassesPage` + `StudentClassPage`

**Files:**
- Create: `frontend/src/pages/StudentClassesPage.tsx`, `frontend/src/pages/StudentClassPage.tsx`
- Test: `frontend/src/test/pages/StudentClassesPage.test.tsx`, `frontend/src/test/pages/StudentClassPage.test.tsx`

**Interfaces:**
- Consumes: `ClassRow.assignment_count/graded_count/next_due_at` (Task 6) for the "Tiến độ" line. The Assignments tab's per-row action logic (`learning_state` → Nộp bài/Xem lịch sử/Xem kết quả/tooltip) is owned by `03-assignments-and-rubrics.md`/`04-submissions.md` — render the Assignments tab's table shell with a placeholder row source in this plan and leave the live wiring to those docs' plans, consistent with how `06-gradebook`/`03-assignments` are treated as separate features elsewhere in this doc.

- [ ] **Step 1: Write the failing tests**

`StudentClassesPage.test.tsx`: mock `GET /api/classes`, assert Name/Teacher/Action columns, not paginated (no `nav.pagination` in the DOM).

`StudentClassPage.test.tsx`: mock `GET /api/classes/{id}`, assert "Tiến độ: {graded_count}/{assignment_count} đã chấm" renders, and that when `next_due_at` is `null` the "Hạn ..." segment is omitted (not showing a stale date) — this directly covers spec §2.5's explicit rule.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- src/test/pages/StudentClassesPage.test.tsx src/test/pages/StudentClassPage.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`frontend/src/pages/StudentClassesPage.tsx`:

```typescript
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Alert } from "../components/Alert";
import { EmptyState } from "../components/EmptyState";
import { Spinner } from "../components/Spinner";
import { Table } from "../components/Table";
import { request } from "../lib/api";
import type { ClassRow, Page } from "../types";

export function StudentClassesPage() {
  const [data, setData] = useState<ClassRow[]>();
  const [failure, setFailure] = useState("");
  useEffect(() => {
    request<Page<ClassRow>>("/classes", { token: sessionStorage.getItem("access_token") ?? undefined })
      .then((page) => setData(page?.results ?? []))
      .catch((error) => setFailure(error instanceof Error ? error.message : "Unable to load classes."));
  }, []);
  if (failure) return <Alert>{failure}</Alert>;
  if (!data) return <Spinner label="Loading classes" />;
  return <section className="page-stack">
    <div className="page-header"><h1>My Classes</h1></div>
    {data.length === 0 ? <EmptyState>No classes enrolled.</EmptyState> : <Table><thead><tr><th>Name</th><th>Teacher</th><th>Action</th></tr></thead>
      <tbody>{data.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.teacher.full_name}</td><td><Link to={`/student/classes/${row.id}`}>View</Link></td></tr>)}</tbody>
    </Table>}
  </section>;
}
```

`frontend/src/pages/StudentClassPage.tsx`:

```typescript
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Alert } from "../components/Alert";
import { Card } from "../components/Card";
import { Spinner } from "../components/Spinner";
import { request } from "../lib/api";
import type { ClassRow } from "../types";
import { formatDate } from "./AdminUsersPage";

export function StudentClassPage() {
  const { classId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "assignments" ? "assignments" : "resources";
  const [class_, setClass] = useState<ClassRow>();
  const [failure, setFailure] = useState("");
  useEffect(() => {
    request<ClassRow>(`/classes/${classId}`, { token: sessionStorage.getItem("access_token") ?? undefined })
      .then((value) => value && setClass(value))
      .catch((error) => setFailure(error instanceof Error ? error.message : "Unable to load class."));
  }, [classId]);
  if (failure) return <Alert>{failure}</Alert>;
  if (!class_) return <Spinner label="Loading class" />;
  const progress = class_.assignment_count != null
    ? `Tiến độ: ${class_.graded_count}/${class_.assignment_count} đã chấm${class_.next_due_at ? ` · Hạn ${formatDate(class_.next_due_at)}` : ""}`
    : null;
  return <section className="page-stack">
    <Link to="/student/classes">‹ Back</Link>
    <h1>{class_.name}</h1>
    {progress && <p>{progress}</p>}
    <p>Giáo viên: {class_.teacher.full_name}</p>
    <div className="tabs" role="tablist">
      <button role="tab" aria-selected={tab === "resources"} onClick={() => setSearchParams({ tab: "resources" })}>Class resources</button>
      <button role="tab" aria-selected={tab === "assignments"} onClick={() => setSearchParams({ tab: "assignments" })}>Assignments</button>
    </div>
    {tab === "resources" && <Card><p className="muted">Class resources — see 07-notifications-and-resources.</p></Card>}
    {tab === "assignments" && <Card><p className="muted">Assignments — see 03-assignments-and-rubrics / 04-submissions.</p></Card>}
  </section>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- src/test/pages/StudentClassesPage.test.tsx src/test/pages/StudentClassPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/StudentClassesPage.tsx frontend/src/pages/StudentClassPage.tsx frontend/src/test/pages/StudentClassesPage.test.tsx frontend/src/test/pages/StudentClassPage.test.tsx
git commit -m "feat(frontend): add StudentClassesPage and StudentClassPage shell"
```

---

### Task 18: Wire routes in `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes every page component from Tasks 12–17, `RequireRole` (already used for `/admin/users/*`).

- [ ] **Step 1: Write the failing test**

Add to an existing or new `frontend/src/test/App.test.tsx` (check if one exists first; if not, a minimal smoke test is enough — this repo's convention is page-level tests, so a full `App.test.tsx` may not exist): a test that navigates to `/admin/classes` (mocking `fetch`) and asserts the `AdminClassesPage` heading "Classes" renders instead of the `Placeholder` "Classes" text — this is what proves the route swap actually happened.

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — route still renders `<Placeholder title="Classes" />`.

- [ ] **Step 3: Implement**

`frontend/src/App.tsx` — replace the single `/classes/*` placeholder line (line 46) with role-scoped routes, and add the imports:

```typescript
import { AdminClassCreatePage } from "./pages/AdminClassCreatePage";
import { AdminClassEditPage } from "./pages/AdminClassEditPage";
import { AdminClassesPage } from "./pages/AdminClassesPage";
import { AdminClassStudentViewPage } from "./pages/AdminClassStudentViewPage";
import { AdminClassViewPage } from "./pages/AdminClassViewPage";
import { StudentClassesPage } from "./pages/StudentClassesPage";
import { StudentClassPage } from "./pages/StudentClassPage";
import { TeacherClassesPage } from "./pages/TeacherClassesPage";
import { TeacherClassPage } from "./pages/TeacherClassPage";
```

Replace line 46 (`<Route path="/classes/*" element={<Placeholder title="Classes" />} />`) with:

```typescript
      <Route element={<RequireRole roles={["TEACHER"]} />}>
        <Route path="/teacher/classes" element={<TeacherClassesPage />} />
        <Route path="/teacher/classes/:classId" element={<TeacherClassPage />} />
      </Route>
      <Route element={<RequireRole roles={["STUDENT"]} />}>
        <Route path="/student/classes" element={<StudentClassesPage />} />
        <Route path="/student/classes/:classId" element={<StudentClassPage />} />
      </Route>
```

And inside the existing `<Route element={<RequireRole roles={["ADMIN"]} />}>` block (lines 48-54), add:

```typescript
        <Route path="/admin/classes" element={<AdminClassesPage />} />
        <Route path="/admin/classes/new" element={<AdminClassCreatePage />} />
        <Route path="/admin/classes/:classId" element={<AdminClassViewPage />} />
        <Route path="/admin/classes/:classId/edit" element={<AdminClassEditPage />} />
        <Route path="/admin/classes/:classId/students/:studentId" element={<AdminClassStudentViewPage />} />
```

Check `frontend/src/components/AppShell.tsx` for the nav-link list and add "Classes" entries pointing at `/admin/classes`, `/teacher/classes`, `/student/classes` per the caller's role, following whatever pattern that file already uses for the "Accounts"/"Audit" links (read it before editing — do not guess the shape).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/test/App.test.tsx` (or the file created in Step 1)
Also: `npx tsc --noEmit` to confirm all new routes/imports typecheck.
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/AppShell.tsx frontend/src/test/App.test.tsx
git commit -m "feat(frontend): wire Classes routes for admin, teacher, and student roles"
```

---

## Self-Review Notes

- **Spec coverage:** §2.1/§2.1.a/§2.1.b → Tasks 12–15; §2.3/§2.4 → Task 16; §2.5 → Task 17; §3 API table → Tasks 2–9; §4 DB → Task 1 (+ `hometown` already exists per gap analysis, no task needed); §5 rules → Tasks 2 (`scoped_classes`/`is_open`), 3 (`is_active`), 7 (teacher reassignment), 8 (`ends_at` extension); §6 edge cases → covered by the same tasks' tests (submission-blocked removal already implemented, only roster-field exposure was added in Task 5).
- **Explicitly out of scope, called out in-line:** Assignments tab content (Task 16/17) and gradebook link — owned by `03-assignments-and-rubrics.md`/`06-gradebook.md`, not re-implemented here to avoid duplicating those docs' plans.
- **Type consistency:** `ClassRow` (Task 10) is the single shape used across Tasks 12–17; `classFormValue`/`classFormPayload` (Task 11) are the only conversion points between `ClassRow` and API payloads, used identically in Task 13 (create) and Task 15 (edit).
