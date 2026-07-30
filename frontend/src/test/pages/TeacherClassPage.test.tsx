import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { TeacherClassPage } from "../../pages/teacher/TeacherClassPage";

const teacher = { id: 2, full_name: "Ada Teacher", email: "ada@example.test" };
const classDetail = {
  id: 9, name: "Cohort 5", description: "Intro cohort", teacher,
  starts_at: "2026-08-01T00:00:00Z", ends_at: "2026-12-01T00:00:00Z",
  is_active: true, student_count: 2, assignment_count: 3, graded_count: 1, next_due_at: null,
};
const studentA = {
  id: 1, full_name: "Bao Nguyen", email: "bao@example.test", phone: "0900000000",
  hometown: "Hanoi", is_active: true, enrolled_at: "2026-07-01T00:00:00Z",
  submitted_assignments: 0, graded_assignments: 0,
};
const studentB = {
  id: 2, full_name: "Chi Le", email: "chi@example.test", phone: null,
  hometown: "Hue", is_active: true, enrolled_at: "2026-07-02T00:00:00Z",
  submitted_assignments: 1, graded_assignments: 1,
};
const roster = (results = [studentA, studentB]) => ({
  total_assignments: 3, enrolled_students: 2, submitted_students: 1, graded_students: 1,
  students: { count: results.length, next: null, previous: null, results },
});
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json" },
});

function openPage(fetchMock: ReturnType<typeof vi.fn>) {
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MemoryRouter initialEntries={["/teacher/classes/9"]}>
      <Routes>
        <Route path="/teacher/classes/:classId" element={<TeacherClassPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Teacher class page", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders header counts from the roster response and a Students table", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(roster()));
    openPage(fetchMock);

    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    expect(screen.getByText("Đã ghi danh 2 · Đã nộp 1 · Đã chấm 1")).toBeTruthy();
    expect(screen.getByText("Bao Nguyen")).toBeTruthy();
    expect(screen.getByText("Chi Le")).toBeTruthy();
  });

  it("narrows the table on search without changing the header counts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(roster()))
      .mockResolvedValueOnce(json(roster([studentA])));
    openPage(fetchMock);
    const events = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Chi Le")).toBeTruthy());
    await events.type(screen.getByLabelText("Search Student"), "Bao");
    await events.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(screen.queryByText("Chi Le")).toBeNull());
    expect(screen.getByText("Bao Nguyen")).toBeTruthy();
    expect(screen.getByText("Đã ghi danh 2 · Đã nộp 1 · Đã chấm 1")).toBeTruthy();
  });

  it("renders a placeholder for the Assignments tab", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(roster()));
    openPage(fetchMock);
    const events = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    await events.click(screen.getByRole("tab", { name: "Assignments" }));

    expect(screen.getByText("Assignments — see 03-assignments-and-rubrics.")).toBeTruthy();
  });
});
