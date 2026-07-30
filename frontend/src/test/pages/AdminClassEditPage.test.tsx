import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { AdminClassEditPage } from "../../pages/admin/classes/AdminClassEditPage";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock, useParams: () => ({ classId: "5" }) };
});

const teacher = { id: 2, full_name: "Ada Teacher", email: "ada@example.test", is_active: true };
const otherTeacher = { id: 3, full_name: "Bob Teacher", email: "bob@example.test", is_active: true };
const inactiveTeacher = { id: 4, full_name: "Charlie Teacher", email: "charlie@example.test", is_active: false };
const teacherPage = { count: 3, next: null, previous: null, results: [teacher, otherTeacher, inactiveTeacher] };
const classData = {
  id: 5, name: "Cohort 5", description: "", teacher,
  starts_at: "2026-08-01T00:00:00Z", ends_at: "2026-12-01T00:00:00Z",
  is_active: true, student_count: 0, assignment_count: 0, graded_count: 0, next_due_at: null,
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json" },
});

function openPage(fetchMock: ReturnType<typeof vi.fn>) {
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter initialEntries={["/admin/classes/5"]}><AdminClassEditPage /></MemoryRouter>);
}

describe("Admin class edit", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
    navigateMock.mockClear();
  });

  it("loads class data and teachers", async () => {
    openPage(vi.fn()
      .mockResolvedValueOnce(json(classData))
      .mockResolvedValueOnce(json(teacherPage)));

    await waitFor(() => expect(screen.getByDisplayValue("Cohort 5")).toBeTruthy());
  });

  it("prefills form fields with class data", async () => {
    openPage(vi.fn()
      .mockResolvedValueOnce(json(classData))
      .mockResolvedValueOnce(json(teacherPage)));

    await waitFor(() => expect(screen.getByDisplayValue("Cohort 5")).toBeTruthy());
    expect(screen.getByDisplayValue("2026-08-01")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Ada Teacher", selected: true })).toBeTruthy();
  });

  it("filters inactive teachers", async () => {
    openPage(vi.fn()
      .mockResolvedValueOnce(json(classData))
      .mockResolvedValueOnce(json(teacherPage)));

    await waitFor(() => expect(screen.getByRole("option", { name: "Ada Teacher" })).toBeTruthy());
    expect(screen.getByRole("option", { name: "Bob Teacher" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Charlie Teacher" })).toBeFalsy();
  });

  it("navigates to the class on successful submit", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classData))
      .mockResolvedValueOnce(json(teacherPage))
      .mockResolvedValueOnce(json({}));
    openPage(fetchMock);
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByDisplayValue("Cohort 5")).toBeTruthy());

    await events.clear(screen.getByLabelText("Name"));
    await events.type(screen.getByLabelText("Name"), "Updated Cohort");
    await events.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/admin/classes/5"));
    const [path, options] = fetchMock.mock.calls[2];
    expect(path).toBe("/api/classes/5");
    expect(options.method).toBe("PATCH");
  });

});
