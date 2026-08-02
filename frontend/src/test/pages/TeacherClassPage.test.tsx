import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { TeacherClassPage } from "../../pages/teacher/TeacherClassPage";
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
const assignmentRow = (overrides: Partial<import("../../types").Assignment> = {}) => ({
  id: 1, classroom_id: 9, title: "Homework 1", description: "Build a small app.",
  due_at: "2026-08-15T20:00:00Z", maximum_score: 100, criteria: [], created_at: "2026-07-20T00:00:00Z",
  learning_state: null, deadline_badge: null, closure_reason: null,
  submitted_count: 12, graded_count: 0, enrolled_count: 24,
  ...overrides,
});

function openPage(fetchMock: ReturnType<typeof vi.fn>, entry = "/teacher/classes/9") {
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MemoryRouter initialEntries={[entry]}>
      <ToastProvider>
        <Routes>
          <Route path="/teacher/classes/:classId" element={<TeacherClassPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("Teacher class resources", () => {
  afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); });

  it("creates a resource and reloads the list", async () => {
    // fetch: 1) class detail  2) GET resources (rỗng)  3) POST resource  4) GET resources (1 dòng)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ id: 1, title: "Slide deck", description: "", url: "https://example.test/s" }, 201))
      .mockResolvedValueOnce(json([{ id: 1, title: "Slide deck", description: "", url: "https://example.test/s" }]));
    openPage(fetchMock, "/teacher/classes/9?tab=resources");
    await userEvent.type(await screen.findByLabelText("Title"), "Slide deck");
    await userEvent.type(screen.getByLabelText("URL"), "https://example.test/s");
    await userEvent.click(screen.getByRole("button", { name: "Tạo tài liệu" }));
    expect(await screen.findByRole("link", { name: /Slide deck/ })).toBeTruthy();
    const [path, init] = fetchMock.mock.calls[2];
    expect(path).toBe("/api/classes/9/resources");
    expect(init.method).toBe("POST");
  });

  it("shows the server validation message when the URL is rejected", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ url: ["Enter a valid URL."] }, 422));
    openPage(fetchMock, "/teacher/classes/9?tab=resources");
    await userEvent.type(await screen.findByLabelText("Title"), "Bad");
    await userEvent.type(screen.getByLabelText("URL"), "not-a-url");
    await userEvent.click(screen.getByRole("button", { name: "Tạo tài liệu" }));
    expect(await screen.findByText("Enter a valid URL.")).toBeTruthy();
  });
});

describe("Teacher class page", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("shows the gradebook in a third tab", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json({
        assignments: [{ id: 11, title: "Graded one", maximum_score: 100 }],
        students: [{
          id: 1, full_name: "Bao Nguyen", email: "bao@example.test", is_active: true,
          grades: [{ assignment_id: 11, learning_state: "GRADED", score: 88 }],
        }],
      }));
    openPage(fetchMock, "/teacher/classes/9?tab=gradebook");

    await waitFor(() => expect(screen.getByRole("tab", { name: "Bảng điểm" })).toBeTruthy());
    await waitFor(() => expect(screen.getByText("88")).toBeTruthy());
    expect(screen.queryByRole("link", { name: "Bảng điểm" })).toBeNull();
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

  it("renders the Assignments tab table with counts, status and edit-disabled past due date", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(roster()))
      .mockResolvedValueOnce(json([
        assignmentRow({ id: 1, title: "Homework 1", due_at: "2999-01-01T20:00:00Z", submitted_count: 12, graded_count: 0, enrolled_count: 24 }),
        assignmentRow({ id: 2, title: "Homework 2", due_at: "2000-01-01T20:00:00Z", submitted_count: 22, graded_count: 22, enrolled_count: 24 }),
      ]));
    openPage(fetchMock);
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    await events.click(screen.getByRole("tab", { name: "Assignments" }));

    await waitFor(() => expect(screen.getByText("Homework 1")).toBeTruthy());
    expect(screen.getByText("12/24")).toBeTruthy();
    expect(screen.getByText("22/24")).toBeTruthy();
    expect(screen.getByText("22 đã chấm")).toBeTruthy();
    const editButtons = screen.getAllByRole("button", { name: "Sửa" });
    expect(editButtons[0].hasAttribute("disabled")).toBe(false);
    expect(editButtons[1].hasAttribute("disabled")).toBe(true);
    expect(editButtons[1].getAttribute("title")).toBe("Assignment đã hết hạn, không thể chỉnh sửa.");
  });

  it("shows an empty state when there are no assignments", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(roster()))
      .mockResolvedValueOnce(json([]));
    openPage(fetchMock);
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    await events.click(screen.getByRole("tab", { name: "Assignments" }));

    await waitFor(() => expect(screen.getByText("No assignments.")).toBeTruthy());
  });

  it("creates an assignment through the dialog and reloads the table", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(roster()))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json(assignmentRow({ id: 3, title: "New one" }), 201))
      .mockResolvedValueOnce(json([assignmentRow({ id: 3, title: "New one" })]));
    openPage(fetchMock);
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    await events.click(screen.getByRole("tab", { name: "Assignments" }));
    await waitFor(() => expect(screen.getByText("No assignments.")).toBeTruthy());

    await events.click(screen.getByRole("button", { name: "Tạo assignment" }));
    await events.type(screen.getByLabelText("Title"), "New one");
    await events.type(screen.getByLabelText("Description"), "A brand new assignment.");
    await events.type(screen.getByLabelText("Due at"), "2999-01-01T20:00");
    await events.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("New one")).toBeTruthy());
    expect(fetchMock.mock.calls[3][0]).toBe("/api/classes/9/assignments");
    expect(fetchMock.mock.calls[3][1]?.method).toBe("POST");
  });

  it("disables saving with a static max score field", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(classDetail))
      .mockResolvedValueOnce(json(roster()))
      .mockResolvedValueOnce(json([]));
    openPage(fetchMock);
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Cohort 5")).toBeTruthy());
    await events.click(screen.getByRole("tab", { name: "Assignments" }));
    await waitFor(() => expect(screen.getByText("No assignments.")).toBeTruthy());

    await events.click(screen.getByRole("button", { name: "Tạo assignment" }));
    expect(screen.queryByLabelText("Max score")).toBeNull();
    expect(screen.getByText("100")).toBeTruthy();
  });
});
