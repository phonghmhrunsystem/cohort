import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { TeacherClassesPage } from "../../pages/teacher/TeacherClassesPage";

const teacher = { id: 2, full_name: "Ada Teacher", email: "ada@example.test" };
const row = (overrides = {}) => ({
  id: 1, name: "Cohort 5", description: "", teacher,
  starts_at: "2026-08-01T00:00:00Z", ends_at: "2026-12-01T00:00:00Z",
  is_active: true, student_count: 12, assignment_count: 3, graded_count: 1, next_due_at: null,
  ...overrides,
});
const page = (results = [row()]) => ({ count: results.length, next: null, previous: null, results });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json" },
});

function openPage(fetchMock: ReturnType<typeof vi.fn>) {
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter initialEntries={["/teacher/classes"]}><TeacherClassesPage /></MemoryRouter>);
}

describe("Teacher classes", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders Name/Students/Action columns with a View link", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(page())));

    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    const columnHeaders = screen.getAllByRole("columnheader").map((el) => el.textContent);
    expect(columnHeaders).toEqual(["Name", "Students", "Action"]);
    expect(screen.getByText("12")).toBeTruthy();
    const link = screen.getByRole("link", { name: "View" });
    expect(link.getAttribute("href")).toBe("/teacher/classes/1");
  });

  it("searches only when the Search button is clicked", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(page()))
      .mockResolvedValueOnce(json(page()));
    openPage(fetchMock);
    const events = userEvent.setup();

    await screen.findByText("Cohort 5");
    await events.type(screen.getByLabelText("Search Classes"), "Cohort");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await events.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/classes?q=Cohort");
  });

  it("shows an empty state when there are no classes", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(page([]))));

    expect(await screen.findByText("No classes assigned.")).toBeTruthy();
  });
});
