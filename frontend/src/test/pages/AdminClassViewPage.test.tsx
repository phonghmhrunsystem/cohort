import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AdminClassViewPage } from "../../pages/AdminClassViewPage";
import { ToastProvider } from "../../components/Toast";

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterAll(() => {
  HTMLDialogElement.prototype.showModal = originalShowModal;
  HTMLDialogElement.prototype.close = originalClose;
});

const teacher = { id: 2, full_name: "Ada Teacher", email: "ada@example.test" };
const classDetail = {
  id: 9, name: "Cohort 5", description: "Intro cohort", teacher,
  starts_at: "2026-08-01T00:00:00Z", ends_at: "2026-12-01T00:00:00Z",
  is_active: true, student_count: 2, assignment_count: 3, graded_count: 1, next_due_at: null,
};
const studentClean = {
  id: 1, full_name: "Bao Nguyen", email: "bao@example.test", phone: "0900000000",
  hometown: "Hanoi", is_active: true, enrolled_at: "2026-07-01T00:00:00Z",
  submitted_assignments: 0, graded_assignments: 0,
};
const studentWithSubmission = {
  id: 2, full_name: "Chi Le", email: "chi@example.test", phone: "0911111111",
  hometown: "Hue", is_active: true, enrolled_at: "2026-07-02T00:00:00Z",
  submitted_assignments: 1, graded_assignments: 0,
};
const roster = {
  total_assignments: 3, enrolled_students: 2, submitted_students: 1, graded_students: 0,
  students: { count: 2, next: null, previous: null, results: [studentClean, studentWithSubmission] },
};
const candidates = [
  { id: 1, full_name: "Bao Nguyen", email: "bao@example.test", phone: "0900000000", hometown: "Hanoi", is_active: true },
  { id: 2, full_name: "Chi Le", email: "chi@example.test", phone: "0911111111", hometown: "Hue", is_active: true },
  { id: 3, full_name: "Dan Pham", email: "dan@example.test", phone: "0922222222", hometown: "Saigon", is_active: true },
];

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json" },
});

function openPage(fetchMock: ReturnType<typeof vi.fn>) {
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MemoryRouter initialEntries={["/admin/classes/9"]}>
      <ToastProvider>
        <Routes>
          <Route path="/admin/classes/:classId" element={<AdminClassViewPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("Admin class view", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders class detail fields and roster table", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(roster));
    openPage(fetchMock);

    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    expect(screen.getByText("Intro cohort")).toBeTruthy();
    expect(screen.getByText("Ada Teacher")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();

    const columnHeaders = screen.getAllByRole("columnheader").map((el) => el.textContent);
    expect(columnHeaders).toEqual(["Name", "Quê quán", "Phone", "Enrolled", "Action"]);
    expect(screen.getByText("Bao Nguyen")).toBeTruthy();
    expect(screen.getByText("Chi Le")).toBeTruthy();
  });

  it("hides Remove for a student with submitted assignments", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(roster));
    openPage(fetchMock);

    await waitFor(() => expect(screen.getByText("Bao Nguyen")).toBeTruthy());

    const cleanRow = screen.getByText("Bao Nguyen").closest("tr")!;
    const submittedRow = screen.getByText("Chi Le").closest("tr")!;
    expect(within(cleanRow).getByRole("button", { name: "Remove" })).toBeTruthy();
    expect(within(submittedRow).queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("opens Edit roster and saves via PUT /classes/:id/enrollments", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(roster))
      .mockResolvedValueOnce(json(candidates))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json(roster));
    openPage(fetchMock);
    const events = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Bao Nguyen")).toBeTruthy());
    await events.click(screen.getByRole("button", { name: "Edit roster" }));

    await waitFor(() => expect(screen.getByText("Dan Pham (dan@example.test)")).toBeTruthy());
    await events.click(screen.getByRole("button", { name: "Save roster" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    const [path, options] = fetchMock.mock.calls[3];
    expect(path).toBe("/api/classes/9/enrollments");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body)).toEqual({ student_ids: [1, 2] });
  });
});
