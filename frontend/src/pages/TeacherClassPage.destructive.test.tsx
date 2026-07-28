// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const harness = vi.hoisted(() => ({
  getClass: vi.fn(), listClassStudents: vi.fn(), listEnrolledStudents: vi.fn(), listAssignments: vi.fn(), createAssignment: vi.fn(), updateAssignment: vi.fn(), replaceRubric: vi.fn(),
}));

vi.mock("../classes", () => ({ getClass: harness.getClass, listClassStudents: harness.listClassStudents, listEnrolledStudents: harness.listEnrolledStudents }));
vi.mock("../assignments", () => ({ ...harness }));

import { TeacherClassPage } from "./TeacherClassPage";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const click = (label: string) => (Array.from(container.querySelectorAll("button")).find((button) => button.textContent === label) as HTMLButtonElement).click();
const dialog = (title: string) => Array.from(container.querySelectorAll("dialog")).find((element) => element.textContent?.includes(title)) as HTMLDialogElement;
const clickDialog = (title: string, label: string) => (Array.from(dialog(title).querySelectorAll("button")).find((button) => button.textContent === label) as HTMLButtonElement).click();

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  history.replaceState({}, "", "/teacher/classes/4?tab=assignments");
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  harness.getClass.mockResolvedValue({ id: 4, teacher_id: 1, name: "Algorithms", description: "", starts_at: "", ends_at: "" });
  harness.listClassStudents.mockResolvedValue([{ id: 7, full_name: " ", email: "blank.student@example.test" }]);
  harness.listEnrolledStudents.mockResolvedValue([{ id: 7, full_name: " ", email: "blank.student@example.test" }]);
  harness.listAssignments.mockResolvedValue([{ id: 9, classroom_id: 4, title: "Essay", description: "", due_at: "2026-08-01T00:00:00Z", maximum_score: 100, criteria: [{ id: 1, title: "Code", maximum_score: 60 }, { id: 2, title: "Writing", maximum_score: 40 }] }]);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(<TeacherClassPage />); });
  await act(async () => { click("Edit rubric"); });
});

afterEach(() => { root.unmount(); container.remove(); });

test("teacher loads the current roster without requesting Admin candidates", () => {
  expect(harness.listEnrolledStudents).toHaveBeenCalledWith(4, "");
  expect(harness.listClassStudents).not.toHaveBeenCalled();
});

test("deleting a rubric criterion changes its local draft only after Xóa", async () => {
  await act(async () => { (container.querySelector('[aria-label="Xóa Code"]') as HTMLButtonElement).click(); });
  expect(dialog("Xóa Code").open).toBe(true);
  await act(async () => { clickDialog("Xóa Code", "Cancel"); });
  expect((container.querySelector('input[value="Code"]') as HTMLInputElement).value).toBe("Code");

  const opener = container.querySelector('[aria-label="Xóa Code"]') as HTMLButtonElement;
  opener.focus();
  await act(async () => { opener.click(); });
  await act(async () => { clickDialog("Xóa Code", "Xóa"); });
  expect(container.querySelector('input[value="Code"]')).toBeNull();
  expect(harness.replaceRubric).not.toHaveBeenCalled();
  expect(document.activeElement?.textContent).toBe("Add criterion");
});

test("blank student names use the email local-part", async () => {
  await act(async () => { click("Students"); });

  expect(container.textContent).toContain("blank.student");
  expect(container.textContent).not.toContain("blank.student@example.test");
});

test("a new blank criterion has a meaningful delete target", async () => {
  await act(async () => { click("Add criterion"); });

  const remove = container.querySelector('[aria-label="Xóa tiêu chí 3"]') as HTMLButtonElement;
  expect(remove).not.toBeNull();
  await act(async () => { remove.click(); });
  expect(dialog("Xóa tiêu chí 3").open).toBe(true);
});
