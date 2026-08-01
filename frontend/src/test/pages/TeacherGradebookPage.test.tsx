import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { TeacherGradebookPage } from "../../pages/teacher/TeacherGradebookPage";
import { ToastProvider } from "../../components/Toast";

const teacher = { id: 2, full_name: "Ada Teacher", email: "ada@example.test" };
const classDetail = {
  id: 9, name: "Cohort 5", description: "Intro cohort", teacher,
  starts_at: "2026-08-01T00:00:00Z", ends_at: "2026-12-01T00:00:00Z",
  is_active: true, student_count: 2, assignment_count: 4, graded_count: 1, next_due_at: null,
};
const assignments = [
  { id: 11, title: "Graded one", maximum_score: 100 },
  { id: 12, title: "Submitted one", maximum_score: 50 },
  { id: 13, title: "Open one", maximum_score: 20 },
  { id: 14, title: "Closed one", maximum_score: 10 },
];
const gradebook = (overrides: { assignments?: unknown[]; students?: unknown[] } = {}) => ({
  assignments,
  students: [
    {
      id: 1, full_name: "Bao Nguyen", email: "bao@example.test", is_active: true,
      grades: [
        { assignment_id: 11, learning_state: "GRADED", score: 88 },
        { assignment_id: 12, learning_state: "SUBMITTED", score: null },
        { assignment_id: 13, learning_state: "OPEN", score: null },
        { assignment_id: 14, learning_state: "CLOSED", score: null },
      ],
    },
    {
      id: 2, full_name: "Chi Le", email: "chi@example.test", is_active: false,
      grades: [
        { assignment_id: 11, learning_state: "GRADED", score: 42 },
        { assignment_id: 12, learning_state: "OPEN", score: null },
        { assignment_id: 13, learning_state: "OPEN", score: null },
        { assignment_id: 14, learning_state: "CLOSED", score: null },
      ],
    },
  ],
  ...overrides,
});
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json" },
});

function openPage(fetchMock: ReturnType<typeof vi.fn>) {
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MemoryRouter initialEntries={["/teacher/classes/9/gradebook"]}>
      <ToastProvider>
        <Routes>
          <Route path="/teacher/classes/:classId/gradebook" element={<TeacherGradebookPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("Teacher gradebook page", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders a score for graded cells and a Vietnamese label for every other state", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(gradebook()));
    openPage(fetchMock);

    await waitFor(() => expect(screen.getByText("Bảng điểm: Cohort 5")).toBeTruthy());
    expect(screen.getByText("88")).toBeTruthy();
    expect(screen.getByText("Đã nộp")).toBeTruthy();
    expect(screen.getAllByText("Chưa nộp").length).toBe(3);
    expect(screen.getAllByText("Đã đóng").length).toBe(2);
    expect(screen.queryByText("Đã chấm")).toBeNull();
  });

  it("links column headers to their assignment and keeps cells unlinked", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(gradebook()));
    openPage(fetchMock);

    await waitFor(() => expect(screen.getByText("Graded one (100)")).toBeTruthy());
    expect(screen.getByRole("link", { name: "Graded one (100)" }).getAttribute("href")).toBe("/teacher/assignments/11");
    expect(screen.getByRole("link", { name: "Closed one (10)" }).getAttribute("href")).toBe("/teacher/assignments/14");
    expect(screen.queryByRole("link", { name: "88" })).toBeNull();
  });

  it("tags disabled students but still shows their scores", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(gradebook()));
    openPage(fetchMock);

    await waitFor(() => expect(screen.getByText("Chi Le")).toBeTruthy());
    expect(screen.getByText("đã tắt")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("shows an empty state instead of a table when the class has no assignments", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(gradebook({ assignments: [] })));
    openPage(fetchMock);

    await waitFor(() => expect(screen.getByText("Lớp chưa có bài tập hoặc học viên.")).toBeTruthy());
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Xuất CSV" })).toBeNull();
  });

  it("surfaces a load failure as an alert", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json({ detail: "Nope." }, 403));
    openPage(fetchMock);

    await waitFor(() => expect(screen.getByText("Unable to load gradebook.")).toBeTruthy());
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("exports the CSV through an authorized request", async () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:gradebook");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(gradebook()))
      .mockResolvedValueOnce(new Response("Họ tên,Email\r\n", { status: 200, headers: { "Content-Type": "text/csv" } }));
    openPage(fetchMock);
    const events = userEvent.setup();

    await waitFor(() => expect(screen.getByRole("button", { name: "Xuất CSV" })).toBeTruthy());
    await events.click(screen.getByRole("button", { name: "Xuất CSV" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [url, init] = fetchMock.mock.calls[2];
    expect(url).toBe("/api/classes/9/gradebook.csv");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:gradebook");
  });
});
