# Grading & Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the frontend for spec [`docs/overview/05-grading-and-results.md`](../../overview/05-grading-and-results.md) — a teacher grade-submission page and a student result block — on top of a backend (`backend/grading/`) that is already complete, spec-compliant, and tested.

**Architecture:** Two new frontend surfaces reusing existing components (`Card`, `Field`, `Textarea`, `Button`, `Alert`, `Spinner`, `IconButton`). `TeacherGradePage` is a new routed page at `/teacher/assignments/:assignmentId/grade/:submissionId` (the route currently 404s — `LatestSubmissions.tsx:56` already links to it). `ResultBlock` is a small self-fetching component mounted inside `StudentAssignmentPage` only when `learning_state === "GRADED"`, so it naturally never calls the result API outside that state.

**Tech Stack:** React + TypeScript, react-router-dom, vitest + @testing-library/react + msw-free `fetch` mocking (existing pattern), plain CSS (`frontend/src/styles.css`), Django REST Framework backend (no changes).

## Global Constraints

- Backend is out of scope: `backend/grading/` (models, serializers, services, views, urls, migration, tests) already implements the full spec. Do not modify it.
- No CSS modules, no Tailwind — use existing global class names (`card`, `field`, `page-stack`, `page-header`, `section-title`, `muted`, `button button-secondary`, `dialog-actions`, `form-actions`).
- Auth token pattern: `const token = () => sessionStorage.getItem("access_token") ?? undefined;`, passed as `{ token: token() }` to `request()`.
- Error handling pattern: catch `ApiFailure` from `../../lib/errors`, branch on `err.status`.
- All UI copy that the spec renders in Vietnamese must match the spec's exact strings (`Chấm điểm`, `Đang chấm…`, `Chấm xong là chốt, không sửa lại được.`, `Học viên đã nộp bản mới, tải lại trang.`, `Kết quả`, `Điểm`, `Nhận xét`).
- Tests use `vitest`, `@testing-library/react`, `MemoryRouter`/`Routes`/`Route`, and the `json(data, status)` / `sessionStorage.setItem("access_token", "token")` / `vi.stubGlobal("fetch", ...)` helpers already established in `frontend/src/test/pages/*.test.tsx`.

## Known spec/backend gap (documented, not fixed here)

Spec §2.1 says on `422 ALREADY_GRADED_MESSAGE` "the page shows the existing grade instead of the form." There is **no teacher-facing endpoint that returns an existing grade's breakdown** (`AssignmentMyResultView` is student-only, 403s a teacher). Fully matching the spec would require a new backend read endpoint, which is out of scope per the constraint above. This plan implements the reachable, safe version instead: on `ALREADY_GRADED_MESSAGE` (whether from initial load's `graded: true` flag or from the PUT's 422), the form is replaced with a plain "Assignment này đã được chấm." message and a back link — same one-way-door guarantee, no fabricated score data. `ponytail: teacher can't see the existing grade's breakdown on this fallback path; add a teacher-scoped grade-read endpoint if this becomes a real support complaint.`

---

## File Structure

- Modify `frontend/src/types.ts` — add `Grade`, `CriterionScoreResult`, `GradeSubmissionInfo` types.
- Modify `frontend/src/lib/api.ts` — add `submissionPath`, `submissionGradePath`, `assignmentMyResultPath` helpers.
- Create `frontend/src/pages/teacher/TeacherGradePage.tsx` — the grade form page.
- Modify `frontend/src/App.tsx` — register the route.
- Create `frontend/src/components/ResultBlock.tsx` — the student result block.
- Modify `frontend/src/pages/student/StudentAssignmentPage.tsx` — mount `ResultBlock` when graded.
- Create `frontend/src/test/pages/TeacherGradePage.test.tsx`.
- Create `frontend/src/test/components/ResultBlock.test.tsx`.

---

### Task 1: Types and API path helpers

**Files:**
- Modify: `frontend/src/types.ts` (append after `TeacherSubmissionRow`, end of file)
- Modify: `frontend/src/lib/api.ts` (append after `submissionDownloadUrl`)

**Interfaces:**
- Produces: `Grade` (`id`, `assignment_id`, `student_id`, `submission_id`, `total_score`, `feedback`, `scores: CriterionScoreResult[]`, `created_at`), `CriterionScoreResult` (`criterion_id`, `score`), `GradeSubmissionInfo` (`id`, `assignment_id`, `student_id`, `student_name`, `original_filename`, `content_type`, `size`, `created_at`, `graded`) — matches `SubmissionSerializer` output for a teacher (`omit_version: true`, see `backend/submissions/serializers.py:57-61`).
- Produces: `submissionPath(submissionId: number): string`, `submissionGradePath(submissionId: number): string`, `assignmentMyResultPath(assignmentId: number): string`.

- [ ] **Step 1: Add types**

Append to `frontend/src/types.ts`:

```typescript
export interface CriterionScoreResult {
  criterion_id: number;
  score: number;
}

export interface Grade {
  id: number;
  assignment_id: number;
  student_id: number;
  submission_id: number;
  total_score: number;
  feedback: string;
  scores: CriterionScoreResult[];
  created_at: string;
}

export interface GradeSubmissionInfo {
  id: number;
  assignment_id: number;
  student_id: number;
  student_name: string | null;
  original_filename: string;
  content_type: string;
  size: number;
  created_at: string;
  graded: boolean;
}
```

- [ ] **Step 2: Add API path helpers**

Append to `frontend/src/lib/api.ts`:

```typescript
export function submissionPath(submissionId: number): string {
  return `/submissions/${submissionId}`;
}

export function submissionGradePath(submissionId: number): string {
  return `/submissions/${submissionId}/grade`;
}

export function assignmentMyResultPath(assignmentId: number): string {
  return `/assignments/${assignmentId}/my-result`;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/lib/api.ts
git commit -m "feat(frontend): add Grade types and grading API paths"
```

---

### Task 2: TeacherGradePage — write the failing tests first

**Files:**
- Create: `frontend/src/test/pages/TeacherGradePage.test.tsx`
- Test target (not yet created): `frontend/src/pages/teacher/TeacherGradePage.tsx`

**Interfaces:**
- Consumes: `request<T>(path, options)` from `../../lib/api`, `ApiFailure` from `../../lib/errors`, `submissionPath`/`submissionGradePath` from Task 1, `NOT_LATEST_MESSAGE = "Only the latest submission version can be graded."` and `ALREADY_GRADED_MESSAGE = "This Assignment has already been graded."` (exact strings from `backend/grading/services.py:11-12`, sent back as `{"detail": ...}` on `422`).
- Produces (for Task 3 to satisfy): route `/teacher/assignments/:assignmentId/grade/:submissionId`, component `TeacherGradePage`.

- [ ] **Step 1: Write the test file**

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { TeacherGradePage } from "../../pages/teacher/TeacherGradePage";

const submissionInfo = (overrides = {}) => ({
  id: 42, assignment_id: 5, student_id: 1, student_name: "Nguyen Van A",
  original_filename: "homework_v3.pdf", content_type: "application/pdf",
  size: 2_400_000, created_at: "2026-08-14T21:02:00Z", graded: false,
  ...overrides,
});

const assignment = (overrides = {}) => ({
  id: 5, classroom_id: 9, title: "Homework 1", description: "Build a small app.",
  due_at: "2026-08-15T20:00:00Z", maximum_score: 100,
  criteria: [
    { id: 1, title: "Correctness", maximum_score: 40 },
    { id: 2, title: "Code quality", maximum_score: 30 },
    { id: 3, title: "Documentation", maximum_score: 30 },
  ],
  created_at: "2026-07-20T00:00:00Z", learning_state: null, deadline_badge: null,
  closure_reason: null, submitted_count: 0, graded_count: 0, enrolled_count: 0,
  ...overrides,
});

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});

function openPage(fetchMock: ReturnType<typeof vi.fn>) {
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MemoryRouter initialEntries={["/teacher/assignments/5/grade/42"]}>
      <Routes>
        <Route path="/teacher/assignments/:assignmentId/grade/:submissionId" element={<TeacherGradePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Teacher grade page", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders one score field per rubric criterion and computes the total client-side", async () => {
    openPage(vi.fn()
      .mockResolvedValueOnce(json(submissionInfo()))
      .mockResolvedValueOnce(json(assignment())));

    await waitFor(() => expect(screen.getByText("Nguyen Van A")).toBeTruthy());
    expect(screen.getByText("homework_v3.pdf")).toBeTruthy();
    expect(screen.getByLabelText("Correctness (40)")).toBeTruthy();
    expect(screen.getByLabelText("Code quality (30)")).toBeTruthy();
    expect(screen.getByLabelText("Documentation (30)")).toBeTruthy();

    const events = userEvent.setup();
    await events.type(screen.getByLabelText("Correctness (40)"), "32");
    await events.type(screen.getByLabelText("Code quality (30)"), "26");
    await events.type(screen.getByLabelText("Documentation (30)"), "24");
    expect(screen.getByText("Total: 82 / 100")).toBeTruthy();
  });

  it("renders a single total-score field when the assignment has no rubric", async () => {
    openPage(vi.fn()
      .mockResolvedValueOnce(json(submissionInfo()))
      .mockResolvedValueOnce(json(assignment({ criteria: [] }))));

    await waitFor(() => expect(screen.getByText("Nguyen Van A")).toBeTruthy());
    expect(screen.getByLabelText("Total score (0-100)")).toBeTruthy();
    expect(screen.queryByLabelText(/Correctness/)).toBeNull();
  });

  it("keeps Chấm điểm disabled until every field is filled, then submits scores[] and feedback", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(submissionInfo()))
      .mockResolvedValueOnce(json(assignment()))
      .mockResolvedValueOnce(json({
        id: 1, assignment_id: 5, student_id: 1, submission_id: 42,
        total_score: 82, feedback: "Good structure, add tests next time.",
        scores: [{ criterion_id: 1, score: 32 }, { criterion_id: 2, score: 26 }, { criterion_id: 3, score: 24 }],
        created_at: "2026-08-16T09:30:00Z",
      }));
    openPage(fetchMock);
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Nguyen Van A")).toBeTruthy());

    const submitButton = screen.getByRole("button", { name: "Chấm điểm" });
    expect(submitButton.hasAttribute("disabled")).toBe(true);

    await events.type(screen.getByLabelText("Correctness (40)"), "32");
    await events.type(screen.getByLabelText("Code quality (30)"), "26");
    await events.type(screen.getByLabelText("Documentation (30)"), "24");
    expect(submitButton.hasAttribute("disabled")).toBe(true);

    await events.type(screen.getByLabelText("Feedback"), "Good structure, add tests next time.");
    expect(submitButton.hasAttribute("disabled")).toBe(false);

    await events.click(submitButton);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [, putInit] = fetchMock.mock.calls[2];
    expect(putInit.method).toBe("PUT");
    expect(JSON.parse(putInit.body)).toEqual({
      scores: [
        { criterion_id: 1, score: 32 },
        { criterion_id: 2, score: 26 },
        { criterion_id: 3, score: 24 },
      ],
      feedback: "Good structure, add tests next time.",
    });
  });

  it("on 422 NOT_LATEST_MESSAGE replaces the form with a reload prompt", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(submissionInfo()))
      .mockResolvedValueOnce(json(assignment({ criteria: [] })))
      .mockResolvedValueOnce(json({ detail: "Only the latest submission version can be graded." }, 422));
    openPage(fetchMock);
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Nguyen Van A")).toBeTruthy());

    await events.type(screen.getByLabelText("Total score (0-100)"), "80");
    await events.type(screen.getByLabelText("Feedback"), "x");
    await events.click(screen.getByRole("button", { name: "Chấm điểm" }));

    await waitFor(() => expect(screen.getByText("Học viên đã nộp bản mới, tải lại trang.")).toBeTruthy());
    expect(screen.queryByLabelText("Total score (0-100)")).toBeNull();
  });

  it("on 422 ALREADY_GRADED_MESSAGE shows the locked message instead of the form", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(submissionInfo()))
      .mockResolvedValueOnce(json(assignment({ criteria: [] })))
      .mockResolvedValueOnce(json({ detail: "This Assignment has already been graded." }, 422));
    openPage(fetchMock);
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Nguyen Van A")).toBeTruthy());

    await events.type(screen.getByLabelText("Total score (0-100)"), "80");
    await events.type(screen.getByLabelText("Feedback"), "x");
    await events.click(screen.getByRole("button", { name: "Chấm điểm" }));

    await waitFor(() => expect(screen.getByText("Assignment này đã được chấm.")).toBeTruthy());
  });

  it("keeps field values on any other failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(submissionInfo()))
      .mockResolvedValueOnce(json(assignment({ criteria: [] })))
      .mockResolvedValueOnce(json({ total_score: ["Use an integer from 0 to 100."] }, 400));
    openPage(fetchMock);
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Nguyen Van A")).toBeTruthy());

    await events.type(screen.getByLabelText("Total score (0-100)"), "150");
    await events.type(screen.getByLabelText("Feedback"), "x");
    await events.click(screen.getByRole("button", { name: "Chấm điểm" }));

    await waitFor(() => expect(screen.getByText("Use an integer from 0 to 100.")).toBeTruthy());
    expect((screen.getByLabelText("Total score (0-100)") as HTMLInputElement).value).toBe("150");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/test/pages/TeacherGradePage.test.tsx`
Expected: FAIL — `Cannot find module '../../pages/teacher/TeacherGradePage'` (file doesn't exist yet).

---

### Task 3: TeacherGradePage — implementation

**Files:**
- Create: `frontend/src/pages/teacher/TeacherGradePage.tsx`
- Modify: `frontend/src/App.tsx` (add import + route inside the `TEACHER` role block, after line 62)

**Interfaces:**
- Consumes: `request`, `submissionPath`, `submissionGradePath` (Task 1), `downloadSubmission` (`lib/api.ts`), `ApiFailure` (`lib/errors.ts`), `formatDateTime`/`formatSize`-style helper (`lib/format.ts` has `formatDateTime`; size formatting is inlined the same way `SubmissionHistory.tsx:21-23` does it — duplicate the 3-line `formatSize`, it's too small to extract), `Card`/`Field`/`Textarea`/`Button`/`Alert`/`Spinner` components, `GradeSubmissionInfo`/`Assignment`/`Grade` types.
- Produces: `TeacherGradePage` component, default export none (named export, matching every other page).

- [ ] **Step 1: Create the page**

```tsx
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Field, Textarea } from "../../components/Field";
import { Spinner } from "../../components/Spinner";
import { downloadSubmission, request, submissionGradePath, submissionPath } from "../../lib/api";
import { ApiFailure } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import type { Assignment, GradeSubmissionInfo } from "../../types";

const NOT_LATEST_MESSAGE = "Only the latest submission version can be graded.";
const ALREADY_GRADED_MESSAGE = "This Assignment has already been graded.";

const token = () => sessionStorage.getItem("access_token") ?? undefined;
const formatSize = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

export function TeacherGradePage() {
  const { assignmentId, submissionId } = useParams();
  const navigate = useNavigate();
  const [submission, setSubmission] = useState<GradeSubmissionInfo>();
  const [assignment, setAssignment] = useState<Assignment>();
  const [scores, setScores] = useState<Record<number, string>>({});
  const [totalScore, setTotalScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [failure, setFailure] = useState("");
  const [staleReload, setStaleReload] = useState(false);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      request<GradeSubmissionInfo>(submissionPath(Number(submissionId)), { token: token() }),
      request<Assignment>(`/assignments/${assignmentId}`, { token: token() }),
    ])
      .then(([loadedSubmission, loadedAssignment]) => {
        if (loadedSubmission) setSubmission(loadedSubmission);
        if (loadedAssignment) setAssignment(loadedAssignment);
        if (loadedSubmission?.graded) setLocked(true);
      })
      .catch(() => setFailure("Unable to load submission."));
  }, [assignmentId, submissionId]);
  useEffect(() => {
    load();
  }, [load]);

  const hasRubric = Boolean(assignment?.criteria.length);
  const total = hasRubric
    ? (assignment?.criteria ?? []).reduce((sum, criterion) => sum + (Number(scores[criterion.id]) || 0), 0)
    : Number(totalScore) || 0;
  const allFilled = hasRubric
    ? (assignment?.criteria ?? []).every((criterion) => scores[criterion.id] !== undefined && scores[criterion.id] !== "")
    : totalScore !== "";
  const canSubmit = allFilled && feedback.trim() !== "" && !busy;

  async function submitGrade(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || !submissionId) return;
    setBusy(true);
    setFailure("");
    try {
      const body = hasRubric
        ? {
          scores: (assignment?.criteria ?? []).map((criterion) => ({
            criterion_id: criterion.id,
            score: Number(scores[criterion.id]),
          })),
          feedback,
        }
        : { total_score: Number(totalScore), feedback };
      await request(submissionGradePath(Number(submissionId)), {
        method: "PUT",
        token: token(),
        body,
      });
      navigate(`/teacher/assignments/${assignmentId}`);
    } catch (err) {
      if (err instanceof ApiFailure && err.status === 422 && err.message === NOT_LATEST_MESSAGE) {
        setStaleReload(true);
      } else if (err instanceof ApiFailure && err.status === 422 && err.message === ALREADY_GRADED_MESSAGE) {
        setLocked(true);
      } else {
        setFailure(err instanceof Error ? err.message : "Chấm điểm thất bại.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!submission || !assignment) return <Spinner label="Loading submission" />;

  return (
    <section className="page-stack">
      <Link className="back-link" to={`/teacher/assignments/${assignmentId}`}>
        ‹ Back to assignment
      </Link>
      <div className="page-header">
        <div>
          <h1>Chấm bài — {submission.student_name}</h1>
          <p className="assignment-due">
            {assignment.title} · Hạn nộp {formatDateTime(assignment.due_at)}
          </p>
        </div>
      </div>
      <Card>
        <p>
          {submission.original_filename} {formatSize(submission.size)} {formatDateTime(submission.created_at)}
        </p>
        <Button
          className="button-secondary"
          onClick={() => downloadSubmission(submission.id, submission.original_filename)}
        >
          Tải
        </Button>
      </Card>

      {locked ? (
        <Alert>Assignment này đã được chấm.</Alert>
      ) : staleReload ? (
        <Alert>
          Học viên đã nộp bản mới, tải lại trang.{" "}
          <button type="button" className="link-button" onClick={load}>
            Tải lại
          </button>
        </Alert>
      ) : (
        <Card>
          <form noValidate onSubmit={submitGrade} className="grade-form">
            {failure && <Alert>{failure}</Alert>}
            {hasRubric ? (
              assignment.criteria.map((criterion) => (
                <Field
                  key={criterion.id}
                  id={`criterion-${criterion.id}`}
                  label={`${criterion.title} (${criterion.maximum_score})`}
                  type="number"
                  min={0}
                  max={criterion.maximum_score}
                  value={scores[criterion.id] ?? ""}
                  onChange={(event) =>
                    setScores((current) => ({ ...current, [criterion.id]: event.target.value }))
                  }
                />
              ))
            ) : (
              <Field
                id="total-score"
                label="Total score (0-100)"
                type="number"
                min={0}
                max={100}
                value={totalScore}
                onChange={(event) => setTotalScore(event.target.value)}
              />
            )}
            <Textarea
              id="feedback"
              label="Feedback"
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
            />
            {hasRubric && <p>Total: {total} / 100 (server-calculated)</p>}
            <p className="muted">Chấm xong là chốt, không sửa lại được.</p>
            <div className="form-actions">
              <Button type="submit" disabled={!canSubmit}>
                {busy ? "Đang chấm…" : "Chấm điểm"}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Wire the route**

In `frontend/src/App.tsx`, add the import next to the other teacher page imports (after line 31):

```typescript
import { TeacherGradePage } from "./pages/teacher/TeacherGradePage";
```

Add the route inside the `TEACHER` `RequireRole` block, after line 62 (`<Route path="/teacher/assignments/:assignmentId" element={<TeacherAssignmentPage />} />`):

```tsx
<Route path="/teacher/assignments/:assignmentId/grade/:submissionId" element={<TeacherGradePage />} />
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/test/pages/TeacherGradePage.test.tsx`
Expected: PASS, all 6 tests.

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/teacher/TeacherGradePage.tsx frontend/src/App.tsx frontend/src/test/pages/TeacherGradePage.test.tsx
git commit -m "feat(frontend): add TeacherGradePage and wire the grade route"
```

---

### Task 4: ResultBlock — write the failing tests first

**Files:**
- Create: `frontend/src/test/components/ResultBlock.test.tsx`
- Test target (not yet created): `frontend/src/components/ResultBlock.tsx`

**Interfaces:**
- Consumes: `request`, `assignmentMyResultPath` (Task 1), `RubricCriterion`/`Submission`/`Grade` types.
- Produces: `ResultBlock` component with props `{ assignmentId: number; criteria: RubricCriterion[]; submissions: Submission[] }`.

- [ ] **Step 1: Write the test file**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResultBlock } from "../../components/ResultBlock";
import type { Submission } from "../../types";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});

const submissions: Submission[] = [
  {
    id: 42, assignment_id: 5, student_id: 1, student_name: "Nguyen Van A",
    version: 2, original_filename: "homework_v3.pdf", content_type: "application/pdf",
    size: 2_400_000, created_at: "2026-08-14T21:02:00Z", graded: true,
  },
];

describe("ResultBlock", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders total, per-criterion breakdown, feedback, and the graded filename", async () => {
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({
      id: 1, assignment_id: 5, student_id: 1, submission_id: 42,
      total_score: 82, feedback: "Good structure, add tests next time.",
      scores: [
        { criterion_id: 1, score: 32 },
        { criterion_id: 2, score: 26 },
        { criterion_id: 3, score: 24 },
      ],
      created_at: "2026-08-16T09:30:00Z",
    })));

    render(
      <ResultBlock
        assignmentId={5}
        criteria={[
          { id: 1, title: "Correctness", maximum_score: 40 },
          { id: 2, title: "Code quality", maximum_score: 30 },
          { id: 3, title: "Documentation", maximum_score: 30 },
        ]}
        submissions={submissions}
      />,
    );

    await waitFor(() => expect(screen.getByText("Điểm: 82 / 100")).toBeTruthy());
    expect(screen.getByText("32 / 40")).toBeTruthy();
    expect(screen.getByText("26 / 30")).toBeTruthy();
    expect(screen.getByText("24 / 30")).toBeTruthy();
    expect(screen.getByText(/Good structure, add tests next time\./)).toBeTruthy();
    expect(screen.getByText(/homework_v3\.pdf/)).toBeTruthy();
  });

  it("omits per-criterion rows when the assignment has no rubric", async () => {
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({
      id: 1, assignment_id: 5, student_id: 1, submission_id: 42,
      total_score: 85, feedback: "Nice reflection", scores: [],
      created_at: "2026-08-16T09:30:00Z",
    })));

    render(<ResultBlock assignmentId={5} criteria={[]} submissions={submissions} />);

    await waitFor(() => expect(screen.getByText("Điểm: 85 / 100")).toBeTruthy());
    expect(screen.queryByText(/\/ 40/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/test/components/ResultBlock.test.tsx`
Expected: FAIL — `Cannot find module '../../components/ResultBlock'`.

---

### Task 5: ResultBlock — implementation, and mount it in StudentAssignmentPage

**Files:**
- Create: `frontend/src/components/ResultBlock.tsx`
- Modify: `frontend/src/pages/student/StudentAssignmentPage.tsx`

**Interfaces:**
- Consumes: `request`, `assignmentMyResultPath` (Task 1), `formatDateTime` (`lib/format.ts`), `RubricCriterion`/`Submission`/`Grade` types.
- Produces: `ResultBlock` component, mounted before `<SubmissionHistory>` in `StudentAssignmentPage` when `learning_state === "GRADED"`.

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useState } from "react";

import { Card } from "./Card";
import { request, assignmentMyResultPath } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type { Grade, RubricCriterion, Submission } from "../types";

const token = () => sessionStorage.getItem("access_token") ?? undefined;

export interface ResultBlockProps {
  assignmentId: number;
  criteria: RubricCriterion[];
  submissions: Submission[];
}

export function ResultBlock({ assignmentId, criteria, submissions }: ResultBlockProps) {
  const [grade, setGrade] = useState<Grade>();

  useEffect(() => {
    request<Grade>(assignmentMyResultPath(assignmentId), { token: token() }).then((loaded) => {
      if (loaded) setGrade(loaded);
    });
  }, [assignmentId]);

  if (!grade) return null;

  const criterionById = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const filename = submissions.find((submission) => submission.id === grade.submission_id)?.original_filename;

  return (
    <Card>
      <p className="section-title">Kết quả</p>
      <p>Điểm: {grade.total_score} / 100</p>
      {grade.scores.length > 0 && (
        <ul className="result-scores">
          {grade.scores.map((score) => {
            const criterion = criterionById.get(score.criterion_id);
            return (
              <li key={score.criterion_id}>
                {criterion?.title} {score.score} / {criterion?.maximum_score}
              </li>
            );
          })}
        </ul>
      )}
      <p>Nhận xét: "{grade.feedback}"</p>
      <p className="muted">
        Đã chấm {formatDateTime(grade.created_at)} · chấm trên {filename}
      </p>
    </Card>
  );
}
```

- [ ] **Step 2: Mount it in StudentAssignmentPage**

In `frontend/src/pages/student/StudentAssignmentPage.tsx`, add the import after line 7:

```typescript
import { ResultBlock } from "../../components/ResultBlock";
```

Insert before the `<SubmissionHistory ...>` call (before line 90):

```tsx
{assignment.learning_state === "GRADED" && (
  <ResultBlock assignmentId={assignment.id} criteria={assignment.criteria} submissions={submissions} />
)}
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/test/components/ResultBlock.test.tsx src/test/pages/StudentAssignmentPage.test.tsx`
Expected: PASS. The existing `"hides the submit form and shows the closure reason once graded"` test in `StudentAssignmentPage.test.tsx` must still pass unchanged — `ResultBlock` is additive, it does not touch the `closureReason` prop passed to `SubmissionHistory`.

- [ ] **Step 4: Typecheck and full frontend suite**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ResultBlock.tsx frontend/src/pages/student/StudentAssignmentPage.tsx frontend/src/test/components/ResultBlock.test.tsx
git commit -m "feat(frontend): show the graded result block on the student assignment page"
```

---

### Task 6: Manual verification in the browser

**Files:** none (verification only).

- [ ] **Step 1: Start backend and frontend dev servers**

Run backend: `cd backend && python manage.py runserver`
Run frontend: `cd frontend && npm run dev`

- [ ] **Step 2: Walk the teacher flow**

Log in as a teacher, open a Class → Assignment with a rubric and an ungraded submission, click `[Chấm]` from the roster. Confirm: criterion fields render with correct max-score labels, `Chấm điểm` stays disabled until every field + feedback is filled, total updates live, submit navigates back to the assignment page and the roster row now shows the score instead of `[Chấm]`.

- [ ] **Step 3: Walk the no-rubric flow**

Repeat step 2 for an assignment with no rubric — confirm the single `Total score (0-100)` field renders instead of criterion fields.

- [ ] **Step 4: Walk the student result flow**

Log in as the graded student, open the assignment. Confirm the `Kết quả` block renders in place of the submit form, shows per-criterion breakdown (or just total for no-rubric), feedback, and the graded filename — and that `Xem kết quả` / `View my result ->` entry points scroll/anchor to it.

- [ ] **Step 5: Report back**

Note any visual mismatches against the spec's ASCII mockups (§2.1, §2.2) for follow-up — do not silently deviate from copy or layout without flagging it.

---

## Self-Review Notes

- **Spec coverage:** §2.1 rubric + no-rubric forms (Task 3), one-way warning copy, busy state, 422 branches (Task 3/2), download button (Task 3) — covered. §2.2 result block, omitted criterion rows on no-rubric, graded filename, no re-grade button (never added) — covered (Task 5/4). §3 API — no changes, already implemented. §5/§5.1/§5.2 — backend-only, already implemented and tested; nothing for this plan to do. §6 edge cases — `NOT_LATEST_MESSAGE`/`ALREADY_GRADED_MESSAGE` handled (Task 3); "assignment has no rubric but scores[] sent" and the reverse are backend-validated 422s surfaced via the generic failure branch (Task 3 Step 1's "keeps field values on any other failure" test covers this shape).
- **Placeholder scan:** none found — every step has real code.
- **Type consistency:** `Grade`/`CriterionScoreResult`/`GradeSubmissionInfo` (Task 1) are the exact same shapes used in Task 3 and Task 5's implementation and tests.
