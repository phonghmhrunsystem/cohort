import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { StudentClassPage } from "../../pages/student/StudentClassPage";

const teacher = { id: 2, full_name: "Ada Teacher", email: "ada@example.test" };
const classDetail = (overrides = {}) => ({
  id: 9, name: "Cohort 5", description: "Intro cohort", teacher,
  starts_at: "2026-08-01T00:00:00Z", ends_at: "2026-12-01T00:00:00Z",
  is_active: true, student_count: 2, assignment_count: 3, graded_count: 1, next_due_at: "2026-08-10T00:00:00Z",
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
    <MemoryRouter initialEntries={["/student/classes/9"]}>
      <Routes>
        <Route path="/student/classes/:classId" element={<StudentClassPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Student class page", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("lists class resources in the resources tab", async () => {
    openPage(vi.fn()
      .mockResolvedValueOnce(json(classDetail()))
      .mockResolvedValueOnce(json([{ id: 1, title: "Slide deck", description: "Week 1 slides", url: "https://example.test/s" }])));
    expect(await screen.findByRole("link", { name: /Slide deck/ })).toBeTruthy();
  });

  it("renders the progress line with graded/assignment counts and a due date", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(classDetail())));

    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    expect(screen.getByText("Tiến độ: 1/3 đã chấm · Hạn 10/08/2026")).toBeTruthy();
  });

  it("omits the Hạn segment entirely when next_due_at is null", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(classDetail({ next_due_at: null }))));

    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    expect(screen.getByText("Tiến độ: 1/3 đã chấm")).toBeTruthy();
    expect(screen.queryByText(/Hạn/)).toBeNull();
  });

  it.each([
    ["OPEN", "Chưa nộp", "Nộp bài"],
    ["SUBMITTED", "Đã nộp", null],
    ["GRADED", "Đã chấm", null],
  ] as const)("maps learning_state %s to the correct Trạng thái and action label", async (learningState, label, actionLabel) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail()))
      /** Tab mặc định là resources, nên trang nạp tài liệu trước khi test mở tab Assignments. */
      .mockResolvedValueOnce(json([]))
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
    expect(screen.getByRole("link", { name: "Xem" })).toBeTruthy();
    if (actionLabel) {
      // Nộp bài is an icon button (03 §2.2), so match the accessible name, not visible text.
      expect(screen.getByRole("link", { name: actionLabel })).toBeTruthy();
    } else {
      // Xem already opens the assignment page; a second link to the same place is noise.
      expect(screen.getAllByRole("link", { name: /Xem/ })).toHaveLength(1);
    }
  });

  it("shows closure_reason as a tooltip and no second action for CLOSED", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail()))
      /** Tab mặc định là resources, nên trang nạp tài liệu trước khi test mở tab Assignments. */
      .mockResolvedValueOnce(json([]))
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
    expect(screen.queryByRole("link", { name: "Nộp bài" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Xem lịch sử" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Xem kết quả" })).toBeNull();
  });
});
