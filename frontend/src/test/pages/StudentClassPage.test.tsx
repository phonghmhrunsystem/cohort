import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { StudentClassPage } from "../../pages/StudentClassPage";

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

  it("renders a placeholder for the Assignments tab", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(classDetail())));
    const events = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    await events.click(screen.getByRole("tab", { name: "Assignments" }));

    expect(screen.getByText("Assignments — see 03-assignments-and-rubrics / 04-submissions.")).toBeTruthy();
  });
});
