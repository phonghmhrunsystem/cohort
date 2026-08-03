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
        { criterion_id: 1, criterion_title: "Correctness", maximum_score: 40, score: 32 },
        { criterion_id: 2, criterion_title: "Code quality", maximum_score: 30, score: 26 },
        { criterion_id: 3, criterion_title: "Documentation", maximum_score: 30, score: 24 },
      ],
      created_at: "2026-08-16T09:30:00Z",
    })));

    render(<ResultBlock assignmentId={5} submissions={submissions} />);

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

    render(<ResultBlock assignmentId={5} submissions={submissions} />);

    await waitFor(() => expect(screen.getByText("Điểm: 85 / 100")).toBeTruthy());
    expect(screen.queryByText(/\/ 40/)).toBeNull();
  });
});
