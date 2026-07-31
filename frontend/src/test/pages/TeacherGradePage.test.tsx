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
