import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { TeacherAssignmentPage } from "../../pages/teacher/TeacherAssignmentPage";

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

const assignment = (overrides = {}) => ({
  id: 5, classroom_id: 9, title: "Homework 1", description: "Build a small app.",
  due_at: "2026-08-15T20:00:00Z", maximum_score: 100,
  criteria: [{ id: 1, title: "Code", maximum_score: 60 }, { id: 2, title: "Tests", maximum_score: 40 }],
  created_at: "2026-07-20T00:00:00Z", learning_state: null, deadline_badge: null, closure_reason: null,
  submitted_count: 0, graded_count: 0, enrolled_count: 0,
  ...overrides,
});
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});

function openPage(fetchMock: ReturnType<typeof vi.fn>) {
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MemoryRouter initialEntries={["/teacher/assignments/5"]}>
      <Routes>
        <Route path="/teacher/assignments/:assignmentId" element={<TeacherAssignmentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Teacher assignment page", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders the assignment header and a submissions stub", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(assignment())));

    await waitFor(() => expect(screen.getByText("Homework 1")).toBeTruthy());
    expect(screen.getByText("Build a small app.")).toBeTruthy();
    expect(screen.getByText("Submissions — see 04-submissions.")).toBeTruthy();
  });

  it("opens the rubric dialog pre-filled with existing criteria and enables Save once total is 100", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(assignment())));
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Homework 1")).toBeTruthy());

    await events.click(screen.getByRole("button", { name: "Sửa rubric" }));
    expect(screen.getByText("Total: 100 / 100")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save rubric" }).hasAttribute("disabled")).toBe(false);

    const firstPoints = screen.getAllByLabelText("Points")[0];
    await events.clear(firstPoints);
    await events.type(firstPoints, "50");
    expect(screen.getByRole("button", { name: "Save rubric" }).hasAttribute("disabled")).toBe(true);
  });

  it("Chia đều splits 100 evenly with the remainder on the first criterion", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(assignment({ criteria: [{ id: 1, title: "A", maximum_score: 34 }, { id: 2, title: "B", maximum_score: 33 }, { id: 3, title: "C", maximum_score: 33 }] }))));
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Homework 1")).toBeTruthy());
    await events.click(screen.getByRole("button", { name: "Sửa rubric" }));
    await events.click(screen.getByRole("button", { name: "Chia đều" }));

    expect((screen.getAllByLabelText("Points")[0] as HTMLInputElement).value).toBe("34");
    expect((screen.getAllByLabelText("Points")[1] as HTMLInputElement).value).toBe("33");
    expect((screen.getAllByLabelText("Points")[2] as HTMLInputElement).value).toBe("33");
  });

  it("Dùng mẫu mặc định fills the three default criteria", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(assignment({ criteria: [] }))));
    const events = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Homework 1")).toBeTruthy());
    await events.click(screen.getByRole("button", { name: "Sửa rubric" }));
    await events.click(screen.getByRole("button", { name: "Dùng mẫu mặc định" }));

    expect(screen.getByDisplayValue("Đúng yêu cầu")).toBeTruthy();
    expect(screen.getByDisplayValue("Chất lượng")).toBeTruthy();
    expect(screen.getByDisplayValue("Trình bày")).toBeTruthy();
  });
});
