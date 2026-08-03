import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { AdminClassesPage } from "../../pages/admin/classes/AdminClassesPage";
import { ToastProvider } from "../../components/Toast";

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

function openClasses(fetchMock: ReturnType<typeof vi.fn>) {
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter initialEntries={["/admin/classes"]}><ToastProvider><AdminClassesPage /></ToastProvider></MemoryRouter>);
}

describe("Admin classes", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders classes with student count and status badge", async () => {
    openClasses(vi.fn().mockResolvedValueOnce(json(page())));

    expect(await screen.findByText("Cohort 5")).toBeTruthy();
    expect(screen.getByText("Ada Teacher")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("01/08/2026")).toBeTruthy();
    expect(screen.getByText("01/12/2026")).toBeTruthy();
  });

  it("searches only when the Search button is clicked", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(page()))
      .mockResolvedValueOnce(json(page()));
    openClasses(fetchMock);
    const events = userEvent.setup();

    await screen.findByText("Cohort 5");
    await events.type(screen.getByLabelText("Class name"), "Cohort");
    await events.type(screen.getByLabelText("Teacher name"), "Ada");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await events.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/classes?q=Cohort&teacher=Ada");
  });

  it("disables the Disable action once the class has started", async () => {
    const started = row({ starts_at: "2020-01-01T00:00:00Z" });
    openClasses(vi.fn().mockResolvedValueOnce(json(page([started]))));

    await screen.findByText("Cohort 5");
    const disableButton = screen.getByRole("button", { name: "Disable" });
    expect(disableButton.hasAttribute("disabled")).toBe(true);
    expect(disableButton.getAttribute("title")).toBe("Class has already started.");
  });
});
