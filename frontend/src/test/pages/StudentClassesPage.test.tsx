import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { StudentClassesPage } from "../../pages/student/StudentClassesPage";

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
  render(<MemoryRouter initialEntries={["/student/classes"]}><StudentClassesPage /></MemoryRouter>);
}

describe("Student classes", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders Name/Teacher/Action columns with a View link", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(page())));

    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    const columnHeaders = screen.getAllByRole("columnheader").map((el) => el.textContent);
    expect(columnHeaders).toEqual(["Name", "Teacher", "Action"]);
    expect(screen.getByText("Ada Teacher")).toBeTruthy();
    const link = screen.getByRole("link", { name: "View" });
    expect(link.getAttribute("href")).toBe("/student/classes/1");
  });

  it("is not paginated", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(page())));

    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    expect(document.querySelector("nav.pagination")).toBeNull();
  });

  it("shows an empty state when there are no classes", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(page([]))));

    expect(await screen.findByText("No classes enrolled.")).toBeTruthy();
  });
});
