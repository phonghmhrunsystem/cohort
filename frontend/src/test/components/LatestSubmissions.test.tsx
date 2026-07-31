import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { LatestSubmissions } from "../../components/LatestSubmissions";
import type { TeacherSubmissionRow } from "../../types";

const row = (overrides: Partial<TeacherSubmissionRow> = {}): TeacherSubmissionRow => ({
  student_id: 1, student_name: "Nguyen Van A", is_active: true,
  submission: { id: 10, original_filename: "homework.pdf", content_type: "application/pdf", size: 2_400_000, created_at: "2026-08-14T21:02:00Z" },
  graded: false, score: null,
  ...overrides,
});

function renderRows(rows: TeacherSubmissionRow[]) {
  render(<MemoryRouter><LatestSubmissions assignmentId={5} rows={rows} /></MemoryRouter>);
}

describe("LatestSubmissions", () => {
  it("shows chưa nộp for a student with no submission", () => {
    renderRows([row({ submission: null })]);
    expect(screen.getByText("chưa nộp")).toBeTruthy();
  });

  it("shows the score instead of a grade action once graded", () => {
    renderRows([row({ graded: true, score: 82 })]);
    expect(screen.getByText("82")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Chấm" })).toBeNull();
  });

  it("shows Chấm as a link to the grading route when not yet graded", () => {
    renderRows([row()]);
    const link = screen.getByRole("link", { name: "Chấm" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/teacher/assignments/5/grade/10");
  });

  it("tags a disabled account with đã tắt but still shows Tải/Chấm", () => {
    renderRows([row({ is_active: false })]);
    expect(screen.getByText("đã tắt")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tải" })).toBeTruthy();
  });

  it("renders the full roster, sorted order as given, even with zero submitters", () => {
    renderRows([row({ student_id: 1, submission: null }), row({ student_id: 2, submission: null })]);
    expect(screen.getAllByText("chưa nộp")).toHaveLength(2);
  });

  it("Tải links to the download endpoint for the latest submission", () => {
    renderRows([row()]);
    const link = screen.getByRole("link", { name: "Tải" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/api/submissions/10/download");
  });
});
