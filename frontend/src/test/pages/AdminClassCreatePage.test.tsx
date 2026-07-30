import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { AdminClassCreatePage } from "../../pages/AdminClassCreatePage";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

const teacher = { id: 2, full_name: "Ada Teacher", email: "ada@example.test", is_active: true };
const teacherPage = { count: 1, next: null, previous: null, results: [teacher] };
const created = {
  id: 9, name: "Cohort 5", description: "", teacher,
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
  render(<MemoryRouter initialEntries={["/admin/classes/new"]}><AdminClassCreatePage /></MemoryRouter>);
}

describe("Admin class create", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
    navigateMock.mockClear();
  });

  it("loads active teachers into the select", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(teacherPage)));

    await waitFor(() => expect(screen.getByRole("option", { name: "Ada Teacher" })).toBeTruthy());
  });

  it("blocks submit on empty name", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(teacherPage));
    openPage(fetchMock);
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("option", { name: "Ada Teacher" })).toBeTruthy());

    await events.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Name is required.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("navigates to the new class on successful submit", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(teacherPage))
      .mockResolvedValueOnce(json(created));
    openPage(fetchMock);
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("option", { name: "Ada Teacher" })).toBeTruthy());

    await events.type(screen.getByLabelText("Name"), "Cohort 5");
    await events.type(screen.getByLabelText("Starts"), "2026-08-01");
    await events.type(screen.getByLabelText("Ends"), "2026-12-01");
    await events.selectOptions(screen.getByLabelText("Teacher"), "2");
    await events.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/admin/classes/9"));
    const [path, options] = fetchMock.mock.calls[1];
    expect(path).toBe("/api/classes");
    expect(options.method).toBe("POST");
  });
});
