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
