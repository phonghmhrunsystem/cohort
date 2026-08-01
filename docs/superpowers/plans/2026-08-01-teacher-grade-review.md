# Teacher Grade Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher read back the grade and feedback they submitted, reach the gradebook from a tab in the class page, and download a submission from an icon instead of a full-width button.

**Architecture:** One new teacher-only read endpoint keyed on `(assignment, student)` serves both entry points, since `Grade` is unique per that pair. The markup that renders a grade is extracted from `ResultBlock` into a presentational `GradeDetail`, reused by the student view and by a new `GradeResultDialog`. The gradebook page body moves into a `GradebookPanel` rendered inside a third tab on the class page.

**Tech Stack:** Django REST Framework (backend, `TestCase` + `APIClient`), React 19 + react-router-dom 7 (frontend), Vitest + Testing Library.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-01-teacher-grade-review-design.md`.
- Teacher-facing changes only. The student result view must render identically afterwards.
- Grades stay immutable once submitted. Nothing here adds an edit path.
- A grade outside the requesting teacher's classes returns 404, never 403 — it must not leak whether the grade exists.
- Backend tests: `cd backend && python manage.py test grading`.
- Frontend tests: `cd frontend && npm test`. Type check: `cd frontend && npx tsc --noEmit`.
- UI copy is Vietnamese, matching the surrounding pages.

## File Structure

| File | Responsibility |
| --- | --- |
| `backend/grading/serializers.py` | Add `criterion_title` + `maximum_score` to `CriterionScoreSerializer` |
| `backend/grading/views.py` | Add `AssignmentStudentResultView` |
| `backend/grading/urls.py` | Register the new route |
| `backend/grading/tests/test_grading.py` | Cover the new endpoint |
| `frontend/src/types.ts` | Extend `CriterionScoreResult` |
| `frontend/src/lib/api.ts` | Add `assignmentStudentResultPath` |
| `frontend/src/components/GradeDetail.tsx` | **New.** Presentational grade rendering |
| `frontend/src/components/ResultBlock.tsx` | Keeps its fetch, delegates rendering |
| `frontend/src/components/GradeResultDialog.tsx` | **New.** Dialog + fetch + `GradeDetail` |
| `frontend/src/components/LatestSubmissions.tsx` | "Xem kết quả" button on graded rows |
| `frontend/src/components/GradebookPanel.tsx` | **New.** Gradebook table + CSV export, clickable graded cells |
| `frontend/src/pages/teacher/TeacherClassPage.tsx` | Third tab, header button removed |
| `frontend/src/pages/teacher/TeacherGradebookPage.tsx` | **Deleted**; route redirects |
| `frontend/src/App.tsx` | Old gradebook route redirects to `?tab=gradebook` |
| `frontend/src/pages/teacher/TeacherGradePage.tsx` | Download becomes an icon |

---

### Task 1: Download button becomes an icon

**Files:**
- Modify: `frontend/src/pages/teacher/TeacherGradePage.tsx:110-120`
- Modify: `frontend/src/styles.css` (add `.submission-row`)
- Test: `frontend/src/test/pages/TeacherGradePage.test.tsx`

**Interfaces:**
- Consumes: `IconButton`, `DownloadIcon` from `components/IconButton`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/test/pages/TeacherGradePage.test.tsx`:

```tsx
  it("offers the submission download as an icon button", async () => {
    renderPage();

    const download = await screen.findByRole("button", { name: "Tải" });
    expect(download.className).toContain("icon-button");
  });
```

Reuse whatever render helper the file already defines; if it renders inline in each test, copy that setup into this test verbatim rather than inventing a helper.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/test/pages/TeacherGradePage.test.tsx`
Expected: FAIL — the button's class is `button button-secondary`, not `icon-button`.

- [ ] **Step 3: Swap the button**

In `TeacherGradePage.tsx`, replace the import of `Button` usage for download and the card body:

```tsx
      <Card>
        <div className="submission-row">
          <p>
            <span>{submission.original_filename}</span> {formatSize(submission.size)} {formatDateTime(submission.created_at)}
          </p>
          <IconButton
            icon={<DownloadIcon />}
            label="Tải"
            onClick={() => downloadSubmission(submission.id, submission.original_filename)}
          />
        </div>
      </Card>
```

Add the import:

```tsx
import { DownloadIcon, IconButton } from "../../components/IconButton";
```

`Button` is still used by the submit action, so keep that import.

Append to `frontend/src/styles.css`:

```css
.submission-row { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
.submission-row p { margin: 0; min-width: 0; overflow-wrap: anywhere; }
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/test/pages/TeacherGradePage.test.tsx`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/teacher/TeacherGradePage.tsx frontend/src/styles.css frontend/src/test/pages/TeacherGradePage.test.tsx
git commit -m "fix(grading): make the submission download an icon button"
```

---

### Task 2: Teacher grade read endpoint

**Files:**
- Modify: `backend/grading/serializers.py:54-57`
- Modify: `backend/grading/views.py`
- Modify: `backend/grading/urls.py`
- Test: `backend/grading/tests/test_grading.py`

**Interfaces:**
- Consumes: `Grade`, `GradeSerializer`, `User.Role`.
- Produces: `GET /api/assignments/<assignment_id>/students/<student_id>/result` returning
  `{id, assignment_id, student_id, submission_id, total_score, feedback, scores: [{criterion_id, criterion_title, maximum_score, score}], created_at}`.

- [ ] **Step 1: Write the failing tests**

Add to `GradingApiTests` in `backend/grading/tests/test_grading.py`. The class's `setUp` already
builds `self.teacher`, `self.other_teacher`, `self.student`, `self.assignment`, `self.c1`,
`self.c2`, `self.submission`, and the authenticated clients.

```python
    def result_url(self, assignment, student):
        return f"/api/assignments/{assignment.id}/students/{student.id}/result"

    def grade_the_submission(self):
        return self.teacher_client.put(
            self.grade_url,
            {"feedback": "Solid work.", "scores": [
                {"criterion_id": self.c1.id, "score": 45},
                {"criterion_id": self.c2.id, "score": 40},
            ]},
            format="json",
        )

    def test_teacher_reads_back_a_grade_with_feedback_and_criteria(self):
        self.grade_the_submission()

        response = self.teacher_client.get(self.result_url(self.assignment, self.student))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total_score"], 85)
        self.assertEqual(response.data["feedback"], "Solid work.")
        self.assertEqual(
            [(row["criterion_title"], row["score"], row["maximum_score"]) for row in response.data["scores"]],
            [("Correctness", 45, 50), ("Style", 40, 50)],
        )

    def test_teacher_of_another_class_cannot_read_the_grade(self):
        self.grade_the_submission()

        response = self.other_teacher_client.get(self.result_url(self.assignment, self.student))

        self.assertEqual(response.status_code, 404)

    def test_student_cannot_use_the_teacher_result_endpoint(self):
        self.grade_the_submission()

        response = self.student_client.get(self.result_url(self.assignment, self.student))

        self.assertEqual(response.status_code, 403)

    def test_reading_an_ungraded_submission_returns_404(self):
        response = self.teacher_client.get(self.result_url(self.assignment, self.student))

        self.assertEqual(response.status_code, 404)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd backend && python manage.py test grading`
Expected: FAIL — the new URL 404s for every case, so the 200 and 403 assertions fail.

- [ ] **Step 3: Widen the criterion serializer**

In `backend/grading/serializers.py`, replace `CriterionScoreSerializer`:

```python
class CriterionScoreSerializer(serializers.ModelSerializer):
    criterion_title = serializers.CharField(source="criterion.title", read_only=True)
    maximum_score = serializers.IntegerField(source="criterion.maximum_score", read_only=True)

    class Meta:
        model = CriterionScore
        fields = ("criterion_id", "criterion_title", "maximum_score", "score")
```

- [ ] **Step 4: Add the view**

In `backend/grading/views.py`, append:

```python
class AssignmentStudentResultView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, assignment_id, student_id):
        if request.user.role != User.Role.TEACHER:
            return Response(status=status.HTTP_403_FORBIDDEN)
        grade = get_object_or_404(
            Grade.objects.select_related("submission").prefetch_related("scores__criterion"),
            assignment_id=assignment_id,
            student_id=student_id,
            assignment__classroom__teacher=request.user,
        )
        return Response(GradeSerializer(grade).data)
```

Filtering on `assignment__classroom__teacher` inside the lookup is what turns another teacher's
grade into a 404 rather than a 403.

- [ ] **Step 5: Register the route**

In `backend/grading/urls.py`:

```python
from .views import AssignmentMyResultView, AssignmentStudentResultView, SubmissionGradeView


urlpatterns = [
    path("submissions/<int:submission_id>/grade", SubmissionGradeView.as_view()),
    path("assignments/<int:assignment_id>/my-result", AssignmentMyResultView.as_view()),
    path("assignments/<int:assignment_id>/students/<int:student_id>/result", AssignmentStudentResultView.as_view()),
]
```

- [ ] **Step 6: Run the tests**

Run: `cd backend && python manage.py test grading`
Expected: PASS, including the pre-existing grading tests.

- [ ] **Step 7: Commit**

```bash
git add backend/grading
git commit -m "feat(grading): let a teacher read back a submitted grade"
```

---

### Task 3: Extract GradeDetail

**Files:**
- Create: `frontend/src/components/GradeDetail.tsx`
- Modify: `frontend/src/components/ResultBlock.tsx`
- Modify: `frontend/src/pages/student/StudentAssignmentPage.tsx:91-93`
- Modify: `frontend/src/types.ts:231-234`
- Test: `frontend/src/test/components/ResultBlock.test.tsx`

**Interfaces:**
- Consumes: `Grade` from `types`.
- Produces: `GradeDetail({ grade, filename }: { grade: Grade; filename?: string })` — renders the
  score line, per-criterion list, feedback, and the graded-at line. `ResultBlock` keeps the props
  `{ assignmentId, submissions }` (the `criteria` prop is gone).

- [ ] **Step 1: Update the existing test to the new payload shape**

In `frontend/src/test/components/ResultBlock.test.tsx`, drop the `criteria` prop from both
`render` calls and move the titles and maxima into the mocked response:

```tsx
      scores: [
        { criterion_id: 1, criterion_title: "Correctness", maximum_score: 40, score: 32 },
        { criterion_id: 2, criterion_title: "Code quality", maximum_score: 30, score: 26 },
        { criterion_id: 3, criterion_title: "Documentation", maximum_score: 30, score: 24 },
      ],
```

```tsx
    render(<ResultBlock assignmentId={5} submissions={submissions} />);
```

Both existing assertions (`32 / 40`, feedback text, `homework_v3.pdf`) stay exactly as they are —
they are the regression guard that the student view is unchanged.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/test/components/ResultBlock.test.tsx`
Expected: FAIL — `32 / 40` is not found, because `ResultBlock` still reads titles from the removed
`criteria` prop.

- [ ] **Step 3: Extend the score type**

In `frontend/src/types.ts`:

```ts
export interface CriterionScoreResult {
  criterion_id: number;
  criterion_title: string;
  maximum_score: number;
  score: number;
}
```

- [ ] **Step 4: Create the component**

`frontend/src/components/GradeDetail.tsx`:

```tsx
import { formatDateTime } from "../lib/format";
import type { Grade } from "../types";

export interface GradeDetailProps {
  grade: Grade;
  filename?: string;
}

export function GradeDetail({ grade, filename }: GradeDetailProps) {
  return (
    <>
      <p>Điểm: {grade.total_score} / 100</p>
      {grade.scores.length > 0 && (
        <ul className="result-scores">
          {grade.scores.map((score) => (
            <li key={score.criterion_id}>
              <span>{score.criterion_title}</span> <span>{score.score} / {score.maximum_score}</span>
            </li>
          ))}
        </ul>
      )}
      <p>Nhận xét: "{grade.feedback}"</p>
      <p className="muted">
        Đã chấm {formatDateTime(grade.created_at)}{filename ? ` · chấm trên ${filename}` : ""}
      </p>
    </>
  );
}
```

- [ ] **Step 5: Rewrite ResultBlock around it**

`frontend/src/components/ResultBlock.tsx`:

```tsx
import { useEffect, useState } from "react";

import { Card } from "./Card";
import { GradeDetail } from "./GradeDetail";
import { request, assignmentMyResultPath } from "../lib/api";
import type { Grade, Submission } from "../types";

const token = () => sessionStorage.getItem("access_token") ?? undefined;

export interface ResultBlockProps {
  assignmentId: number;
  submissions: Submission[];
}

export function ResultBlock({ assignmentId, submissions }: ResultBlockProps) {
  const [grade, setGrade] = useState<Grade>();

  useEffect(() => {
    request<Grade>(assignmentMyResultPath(assignmentId), { token: token() })
      .then((loaded) => {
        if (loaded) setGrade(loaded);
      })
      .catch(() => {});
  }, [assignmentId]);

  if (!grade) return null;

  return (
    <Card>
      <p className="section-title">Kết quả</p>
      <GradeDetail
        grade={grade}
        filename={submissions.find((submission) => submission.id === grade.submission_id)?.original_filename}
      />
    </Card>
  );
}
```

- [ ] **Step 6: Update the student call site**

In `frontend/src/pages/student/StudentAssignmentPage.tsx`, drop the `criteria` prop:

```tsx
      {assignment.learning_state === "GRADED" && (
        <ResultBlock assignmentId={assignment.id} submissions={submissions} />
      )}
```

- [ ] **Step 7: Run the tests and the type check**

Run: `cd frontend && npx vitest run src/test/components/ResultBlock.test.tsx src/test/pages/StudentAssignmentPage.test.tsx && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/GradeDetail.tsx frontend/src/components/ResultBlock.tsx frontend/src/pages/student/StudentAssignmentPage.tsx frontend/src/types.ts frontend/src/test/components/ResultBlock.test.tsx
git commit -m "refactor(grading): extract GradeDetail from ResultBlock"
```

---

### Task 4: GradeResultDialog

**Files:**
- Create: `frontend/src/components/GradeResultDialog.tsx`
- Modify: `frontend/src/lib/api.ts`
- Test: `frontend/src/test/components/GradeResultDialog.test.tsx`

**Interfaces:**
- Consumes: `Dialog`, `GradeDetail`, `Spinner`, `Alert`, `request`.
- Produces: `assignmentStudentResultPath(assignmentId: number, studentId: number): string` and
  `GradeResultDialog({ assignmentId, studentId, studentName, open, onClose })`.

- [ ] **Step 1: Write the failing test**

`frontend/src/test/components/GradeResultDialog.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GradeResultDialog } from "../../components/GradeResultDialog";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});

const grade = {
  id: 1, assignment_id: 5, student_id: 7, submission_id: 42,
  total_score: 85, feedback: "Solid work.",
  scores: [{ criterion_id: 1, criterion_title: "Correctness", maximum_score: 50, score: 45 }],
  created_at: "2026-08-16T09:30:00Z",
};

describe("GradeResultDialog", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("loads and shows the score, criteria, and feedback", async () => {
    sessionStorage.setItem("access_token", "token");
    const fetchMock = vi.fn().mockResolvedValueOnce(json(grade));
    vi.stubGlobal("fetch", fetchMock);

    render(<GradeResultDialog assignmentId={5} studentId={7} studentName="Nguyen Van A" open onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText("Điểm: 85 / 100")).toBeTruthy());
    expect(screen.getByText("45 / 50")).toBeTruthy();
    expect(screen.getByText(/Solid work\./)).toBeTruthy();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/assignments/5/students/7/result");
  });

  it("shows an alert when the request fails", async () => {
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ detail: "Not found" }, 404)));

    render(<GradeResultDialog assignmentId={5} studentId={7} studentName="Nguyen Van A" open onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText("Không tải được kết quả chấm.")).toBeTruthy());
  });

  it("does not fetch while closed", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<GradeResultDialog assignmentId={5} studentId={7} studentName="Nguyen Van A" open={false} onClose={() => {}} />);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/test/components/GradeResultDialog.test.tsx`
Expected: FAIL — cannot resolve `../../components/GradeResultDialog`.

- [ ] **Step 3: Add the path helper**

In `frontend/src/lib/api.ts`, next to `assignmentMyResultPath`:

```ts
export function assignmentStudentResultPath(assignmentId: number, studentId: number): string {
  return `/assignments/${assignmentId}/students/${studentId}/result`;
}
```

- [ ] **Step 4: Write the component**

`frontend/src/components/GradeResultDialog.tsx`:

```tsx
import { useEffect, useState } from "react";

import { Alert } from "./Alert";
import { Dialog } from "./Dialog";
import { GradeDetail } from "./GradeDetail";
import { Spinner } from "./Spinner";
import { assignmentStudentResultPath, request } from "../lib/api";
import type { Grade } from "../types";

const token = () => sessionStorage.getItem("access_token") ?? undefined;

export interface GradeResultDialogProps {
  assignmentId: number;
  studentId: number;
  studentName: string;
  open: boolean;
  onClose: () => void;
}

export function GradeResultDialog({ assignmentId, studentId, studentName, open, onClose }: GradeResultDialogProps) {
  const [grade, setGrade] = useState<Grade>();
  const [failure, setFailure] = useState("");

  useEffect(() => {
    if (!open) return;
    setGrade(undefined);
    setFailure("");
    let active = true;
    request<Grade>(assignmentStudentResultPath(assignmentId, studentId), { token: token() })
      .then((loaded) => {
        if (active && loaded) setGrade(loaded);
      })
      .catch(() => {
        if (active) setFailure("Không tải được kết quả chấm.");
      });
    return () => {
      active = false;
    };
  }, [assignmentId, studentId, open]);

  return (
    <Dialog open={open} onClose={onClose} title={`Kết quả: ${studentName}`}>
      {failure ? <Alert>{failure}</Alert> : !grade ? <Spinner label="Loading result" /> : <GradeDetail grade={grade} />}
    </Dialog>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/test/components/GradeResultDialog.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/GradeResultDialog.tsx frontend/src/lib/api.ts frontend/src/test/components/GradeResultDialog.test.tsx
git commit -m "feat(grading): add a dialog for reviewing a submitted grade"
```

---

### Task 5: Review button on graded submission rows

**Files:**
- Modify: `frontend/src/components/LatestSubmissions.tsx:43-65`
- Test: `frontend/src/test/components/LatestSubmissions.test.tsx`

**Interfaces:**
- Consumes: `GradeResultDialog` from Task 4, `EyeIcon` / `IconButton`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/test/components/LatestSubmissions.test.tsx`, following the render helper the
file already uses:

```tsx
  it("opens the grade result dialog from a graded row", async () => {
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1, assignment_id: 5, student_id: 1, submission_id: 42,
      total_score: 85, feedback: "Solid work.", scores: [],
      created_at: "2026-08-16T09:30:00Z",
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    renderRows();

    await userEvent.click(screen.getByRole("button", { name: "Xem kết quả" }));

    await waitFor(() => expect(screen.getByText("Điểm: 85 / 100")).toBeTruthy());
  });
```

The fixture rows in that file must include at least one row with `graded: true` and a
`submission`; if none does, add one to the fixture.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/test/components/LatestSubmissions.test.tsx`
Expected: FAIL — no button named "Xem kết quả".

- [ ] **Step 3: Add the button and dialog**

In `LatestSubmissions.tsx`, add state and the dialog. The row already carries `student_id` and the
component already takes `assignmentId`:

```tsx
  const [reviewing, setReviewing] = useState<TeacherSubmissionRow>();
```

In the actions column, alongside the download button:

```tsx
            {row.graded ? (
              <IconButton icon={<EyeIcon />} label="Xem kết quả" onClick={() => setReviewing(row)} />
            ) : (
              <IconLinkButton
                icon={<GradeIcon />}
                label="Chấm"
                to={`/teacher/assignments/${assignmentId}/grade/${row.submission.id}`}
              />
            )}
```

At the end of the returned fragment, after `<Pagination … />`:

```tsx
      {reviewing && (
        <GradeResultDialog
          assignmentId={assignmentId}
          studentId={reviewing.student_id}
          studentName={reviewing.student_name}
          open
          onClose={() => setReviewing(undefined)}
        />
      )}
```

Imports to add: `EyeIcon` on the existing `IconButton` import line, and
`import { GradeResultDialog } from "./GradeResultDialog";`.

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/test/components/LatestSubmissions.test.tsx`
Expected: PASS, including the file's existing download and grade-link tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LatestSubmissions.tsx frontend/src/test/components/LatestSubmissions.test.tsx
git commit -m "feat(grading): review a grade from the submissions list"
```

---

### Task 6: Gradebook becomes a tab with clickable cells

**Files:**
- Create: `frontend/src/components/GradebookPanel.tsx`
- Delete: `frontend/src/pages/teacher/TeacherGradebookPage.tsx`
- Modify: `frontend/src/pages/teacher/TeacherClassPage.tsx:118-124`
- Modify: `frontend/src/App.tsx:31,63`
- Modify: `frontend/src/styles.css`
- Test: `frontend/src/test/pages/TeacherGradebookPage.test.tsx` → rewritten as `frontend/src/test/components/GradebookPanel.test.tsx`
- Test: `frontend/src/test/pages/TeacherClassPage.test.tsx`

**Interfaces:**
- Consumes: `GradeResultDialog` from Task 4, `classGradebookPath`, `downloadGradebookCsv`.
- Produces: `GradebookPanel({ classId }: { classId: number })`.

Note: no `GradebookIcon` is needed — the tab is a text tab like Students and Assignments.

- [ ] **Step 1: Move the gradebook test onto the panel**

`git mv frontend/src/test/pages/TeacherGradebookPage.test.tsx frontend/src/test/components/GradebookPanel.test.tsx`,
then in the moved file: import `GradebookPanel` from `../../components/GradebookPanel`, drop the
`MemoryRouter` route wrapper down to a bare `<MemoryRouter><GradebookPanel classId={9} /></MemoryRouter>`
(the panel still renders `<Link>`s in its column headers), drop the class-record fetch mock — the
panel only fetches the gradebook — and drop the heading assertion, since the class name now lives
on the page. Keep the table, empty state, load failure, and CSV export tests.

Add one new test:

```tsx
  it("opens the grade dialog from a graded cell", async () => {
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json(gradebook()))
      .mockResolvedValueOnce(json({
        id: 1, assignment_id: 1, student_id: 1, submission_id: 42,
        total_score: 85, feedback: "Solid work.", scores: [],
        created_at: "2026-08-16T09:30:00Z",
      })));

    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: /^Xem kết quả/ }));

    await waitFor(() => expect(screen.getByText("Điểm: 85 / 100")).toBeTruthy());
  });
```

Adjust the fixture so at least one cell has `learning_state: "GRADED"` with a numeric `score`.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/test/components/GradebookPanel.test.tsx`
Expected: FAIL — cannot resolve `../../components/GradebookPanel`.

- [ ] **Step 3: Create the panel**

`frontend/src/components/GradebookPanel.tsx` — the body of the old `TeacherGradebookPage`, minus
the class fetch, the page header, and the back link, plus clickable graded cells:

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Alert } from "./Alert";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { GradeResultDialog } from "./GradeResultDialog";
import { Spinner } from "./Spinner";
import { DataTable, TruncatedText, type Column } from "./Table";
import { useToast } from "./Toast";
import { classGradebookPath, downloadGradebookCsv, request } from "../lib/api";
import type { GradebookCell, GradebookResponse, GradebookStudent, LearningState } from "../types";

const stateLabels: Record<Exclude<LearningState, "GRADED">, string> = {
  SUBMITTED: "Đã nộp",
  OPEN: "Chưa nộp",
  CLOSED: "Đã đóng",
};

interface Reviewing {
  assignmentId: number;
  studentId: number;
  studentName: string;
}

export function GradebookPanel({ classId }: { classId: number }) {
  const [gradebook, setGradebook] = useState<GradebookResponse>();
  const [failure, setFailure] = useState("");
  const [reviewing, setReviewing] = useState<Reviewing>();
  const toast = useToast();
  const token = () => sessionStorage.getItem("access_token") ?? undefined;

  useEffect(() => {
    request<GradebookResponse>(classGradebookPath(classId), { token: token() })
      .then((value) => value && setGradebook(value))
      .catch(() => setFailure("Unable to load gradebook."));
  }, [classId]);

  async function exportCsv() {
    try {
      await downloadGradebookCsv(classId);
    } catch {
      toast.error("Unable to export CSV.");
    }
  }

  if (failure) return <Alert>{failure}</Alert>;
  if (!gradebook) return <Spinner label="Loading gradebook" />;

  const columns: Column<GradebookStudent>[] = [
    {
      key: "student",
      header: "Học viên",
      width: "14rem",
      className: "gradebook-student",
      render: (student) => <>
        <TruncatedText>{student.full_name || student.email}</TruncatedText>
        {!student.is_active && <Badge className="badge-disabled">đã tắt</Badge>}
      </>,
    },
    ...gradebook.assignments.map((assignment) => ({
      key: `assignment-${assignment.id}`,
      header: <Link to={`/teacher/assignments/${assignment.id}`}>{assignment.title} ({assignment.maximum_score})</Link>,
      width: "9rem",
      render: (student: GradebookStudent) => {
        const cell = student.grades.find((grade: GradebookCell) => grade.assignment_id === assignment.id);
        if (!cell) return "";
        const name = student.full_name || student.email;
        if (cell.learning_state !== "GRADED") return stateLabels[cell.learning_state];
        return (
          <button
            type="button"
            className="gradebook-cell-button"
            aria-label={`Xem kết quả ${name} · ${assignment.title}`}
            onClick={() => setReviewing({ assignmentId: assignment.id, studentId: student.id, studentName: name })}
          >
            {cell.score}
          </button>
        );
      },
    })),
  ];

  const empty = gradebook.assignments.length === 0 || gradebook.students.length === 0;
  return <Card>
    {empty ? <EmptyState>Lớp chưa có bài tập hoặc học viên.</EmptyState> : <>
      <div className="gradebook-table"><DataTable columns={columns} data={gradebook.students} rowKey={(student) => student.id} /></div>
      <div className="form-actions gradebook-actions"><Button onClick={exportCsv}>Xuất CSV</Button></div>
    </>}
    {reviewing && (
      <GradeResultDialog
        assignmentId={reviewing.assignmentId}
        studentId={reviewing.studentId}
        studentName={reviewing.studentName}
        open
        onClose={() => setReviewing(undefined)}
      />
    )}
  </Card>;
}
```

Append to `frontend/src/styles.css`:

```css
.gradebook-cell-button { border: 0; background: none; padding: 0; color: var(--color-primary); font: inherit; text-decoration: underline; cursor: pointer; }
```

- [ ] **Step 4: Run the panel tests**

Run: `cd frontend && npx vitest run src/test/components/GradebookPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing tab test**

Add to `frontend/src/test/pages/TeacherClassPage.test.tsx`, matching that file's existing render
helper and fetch mocking:

```tsx
  it("shows the gradebook in a third tab", async () => {
    renderPage("/teacher/classes/9?tab=gradebook");

    await waitFor(() => expect(screen.getByRole("tab", { name: "Bảng điểm" })).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Học viên")).toBeTruthy());
  });
```

The page's fetch mock must answer `/classes/9/gradebook` with a gradebook payload; extend the
helper's mock accordingly.

- [ ] **Step 6: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/test/pages/TeacherClassPage.test.tsx`
Expected: FAIL — no tab named "Bảng điểm".

- [ ] **Step 7: Add the tab**

In `TeacherClassPage.tsx`, drop the header link and add the tab:

```tsx
    <div className="page-header"><h1>{class_.name}</h1></div>
    <div className="tabs" role="tablist">
      <button type="button" className="tab" role="tab" aria-selected={tab === "students"} onClick={() => setSearchParams({ tab: "students" })}>Students</button>
      <button type="button" className="tab" role="tab" aria-selected={tab === "assignments"} onClick={() => setSearchParams({ tab: "assignments" })}>Assignments</button>
      <button type="button" className="tab" role="tab" aria-selected={tab === "gradebook"} onClick={() => setSearchParams({ tab: "gradebook" })}>Bảng điểm</button>
    </div>
```

and after the assignments tab block:

```tsx
    {tab === "gradebook" && <GradebookPanel classId={Number(classId)} />}
```

Add `import { GradebookPanel } from "../../components/GradebookPanel";` and drop the now-unused
`Link` import only if nothing else on the page uses it — the back link does, so keep it.

- [ ] **Step 8: Redirect the old route**

In `frontend/src/App.tsx`, drop the `TeacherGradebookPage` import and replace the route:

```tsx
        <Route path="/teacher/classes/:classId/gradebook" element={<GradebookRedirect />} />
```

with, near the other small helpers in that file:

```tsx
function GradebookRedirect() {
  const { classId } = useParams();
  return <Navigate replace to={`/teacher/classes/${classId}?tab=gradebook`} />;
}
```

Add `Navigate` and `useParams` to the existing `react-router-dom` import, then delete
`frontend/src/pages/teacher/TeacherGradebookPage.tsx`.

- [ ] **Step 9: Run the full suite and the type check**

Run: `cd frontend && npm test && npx tsc --noEmit`
Expected: PASS, no type errors, no reference left to `TeacherGradebookPage`.

- [ ] **Step 10: Commit**

```bash
git add -A frontend/src
git commit -m "feat(gradebook): move the gradebook into a class tab with reviewable cells"
```

---

## Final verification

- [ ] `cd backend && python manage.py test` — full backend suite passes.
- [ ] `cd frontend && npm test` — full frontend suite passes.
- [ ] `cd frontend && npx tsc --noEmit` — no type errors.
- [ ] `grep -rn "TeacherGradebookPage" frontend/src` returns nothing.
- [ ] `grep -rn "criteria=" frontend/src | grep ResultBlock` returns nothing.
