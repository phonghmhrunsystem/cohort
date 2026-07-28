// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const harness = vi.hoisted(() => ({
  listClasses: vi.fn(),
  listTeachers: vi.fn(),
  createClass: vi.fn(),
  updateClass: vi.fn(),
}));

vi.mock("../classes", () => ({ ...harness }));

import { AdminClassesPage } from "./AdminClassesPage";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("location", { search: "" });
  Object.assign(HTMLDialogElement.prototype, {
    close(this: HTMLDialogElement) { this.open = false; },
    showModal(this: HTMLDialogElement) { this.open = true; },
  });
  harness.listClasses.mockResolvedValue([{
    id: 4, teacher_id: 7, name: "Algorithms", description: "",
    starts_at: "2026-07-01T00:00:00Z", ends_at: "2026-08-01T00:00:00Z",
  }]);
  harness.listTeachers.mockResolvedValue([{
    id: 7, full_name: " ", email: "ada.teacher@example.test", role: "TEACHER",
    phone: null, date_of_birth: null, gender: null, address: null, is_active: true,
  }]);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(<AdminClassesPage />); });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("class cards display a blank teacher name as the email local-part", () => {
  expect(container.textContent).toContain("Teacher: ada.teacher");
  expect(container.textContent).not.toContain("Teacher: 7");
});

test("class editing uses the shared dialog", async () => {
  const create = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Create Class")!;

  await act(async () => { create.click(); });

  expect(container.querySelector<HTMLDialogElement>("dialog.app-dialog")?.open).toBe(true);
  expect(container.querySelector("dialog.account-dialog")).toBeNull();
});
