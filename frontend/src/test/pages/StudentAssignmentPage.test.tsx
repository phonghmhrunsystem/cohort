import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { StudentAssignmentPage } from "../../pages/student/StudentAssignmentPage";

const assignment = (overrides = {}) => ({
  id: 5, classroom_id: 9, title: "Homework 1", description: "Build a small app.",
  due_at: "2026-08-15T20:00:00Z", maximum_score: 100, criteria: [],
  created_at: "2026-07-20T00:00:00Z", learning_state: "OPEN",
  deadline_badge: "Còn 3 ngày", closure_reason: null,
  ...overrides,
});

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});

function pdfFile(name = "homework.pdf", sizeBytes = 1024) {
  const file = new File(["%PDF-1.4"], name, { type: "application/pdf" });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

function openPage(fetchMock: ReturnType<typeof vi.fn>) {
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MemoryRouter initialEntries={["/student/assignments/5"]}>
      <Routes>
        <Route path="/student/assignments/:assignmentId" element={<StudentAssignmentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Student assignment page", () => {
  it("renders header, due date badge, and description", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(assignment()))
      .mockResolvedValueOnce(json([]));
    openPage(fetchMock);

    await waitFor(() => expect(screen.getByText("Homework 1")).toBeTruthy());
    expect(screen.getByText("Còn 3 ngày")).toBeTruthy();
    expect(screen.getByText("Build a small app.")).toBeTruthy();
    expect(screen.getByText("Chưa nộp")).toBeTruthy();
  });

  it("hides the submit form and shows the closure reason once graded", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(assignment({ learning_state: "GRADED", closure_reason: "Đã chấm, không thể nộp lại" })))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({
        id: 1, assignment_id: 5, student_id: 1, submission_id: 1,
        total_score: 90, feedback: "Good job", scores: [], created_at: "2026-07-25T00:00:00Z",
      }));
    openPage(fetchMock);

    await waitFor(() => expect(screen.getByText("Homework 1")).toBeTruthy());
    expect(screen.getByText("Đã chấm, không thể nộp lại")).toBeTruthy();
    expect(screen.queryByLabelText(/(chọn|đổi) file/i)).toBeNull();
  });

  it("has no Cancel button — only the Back link", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(assignment()))
      .mockResolvedValueOnce(json([]));
    openPage(fetchMock);

    await waitFor(() => expect(screen.getByText("Homework 1")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(screen.getByRole("link", { name: /back/i })).toBeTruthy();
  });

  it("warns before leaving via Back to Class with a picked-but-unsubmitted file, and stays if cancelled", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(assignment()))
      .mockResolvedValueOnce(json([]));
    openPage(fetchMock);
    await waitFor(() => expect(screen.getByText("Homework 1")).toBeTruthy());

    const events = userEvent.setup();
    await events.upload(screen.getByLabelText(/(chọn|đổi) file/i), pdfFile());
    expect(screen.getByText("homework.pdf")).toBeTruthy();

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    await events.click(screen.getByRole("link", { name: /back/i }));

    expect(confirmSpy).toHaveBeenCalledWith("Bạn chưa nộp bài, thoát?");
    expect(screen.getByText("Homework 1")).toBeTruthy();
    confirmSpy.mockRestore();
  });
});
