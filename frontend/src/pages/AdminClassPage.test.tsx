// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const harness = vi.hoisted(() => ({
  getClass: vi.fn(), listClassStudents: vi.fn(), listStudentAccounts: vi.fn(), enrollStudent: vi.fn(), removeStudent: vi.fn(),
}));

vi.mock("../classes", () => harness);

import { AdminClassPage } from "./AdminClassPage";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const click = (label: string) => (Array.from(container.querySelectorAll("button")).find((button) => button.textContent === label) as HTMLButtonElement).click();
const dialog = (title: string) => Array.from(container.querySelectorAll("dialog")).find((element) => element.textContent?.includes(title)) as HTMLDialogElement;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  harness.getClass.mockResolvedValue({ id: 4, teacher_id: 1, name: "Algorithms", description: "", starts_at: "", ends_at: "" });
  harness.listClassStudents.mockResolvedValueOnce({ total_assignments: 0, enrolled_students: 1, submitted_students: 0, graded_students: 0, students: [{ id: 7, full_name: "Nguyễn An", email: "an@example.test", submitted_assignments: 0, graded_assignments: 0 }] }).mockResolvedValue({ total_assignments: 0, enrolled_students: 0, submitted_students: 0, graded_students: 0, students: [] });
  harness.listStudentAccounts.mockResolvedValue([]);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(<AdminClassPage />); });
});

afterEach(() => { root.unmount(); container.remove(); });

test("removing a student does nothing after Cancel", async () => {
  await act(async () => { click("Remove Student"); });
  expect(dialog("Gỡ Nguyễn An").open).toBe(true);
  await act(async () => { click("Cancel"); });
  expect(harness.removeStudent).not.toHaveBeenCalled();
});

test("removing a student sends one request only after Gỡ", async () => {
  harness.removeStudent.mockResolvedValue(undefined);
  const opener = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Remove Student") as HTMLButtonElement;
  opener.focus();
  await act(async () => { opener.click(); });
  await act(async () => { click("Gỡ"); });
  expect(harness.removeStudent).toHaveBeenCalledTimes(1);
  expect(document.activeElement?.textContent).toBe("Students");
});

test("a 422 keeps the removal confirmation open", async () => {
  harness.removeStudent.mockRejectedValueOnce({ detail: "Student has a submission." });
  await act(async () => { click("Remove Student"); });
  await act(async () => { click("Gỡ"); });
  expect(dialog("Gỡ Nguyễn An").open).toBe(true);
  expect(container.textContent).toContain("Student has a submission.");
});
