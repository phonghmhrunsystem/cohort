// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const harness = vi.hoisted(() => ({
  getClass: vi.fn(), listClassStudents: vi.fn(), getClassStudent: vi.fn(), listAssignments: vi.fn(),
}));

vi.mock("../classes", () => ({ getClass: harness.getClass, listClassStudents: harness.listClassStudents, getClassStudent: harness.getClassStudent }));
vi.mock("../assignments", () => ({ listAssignments: harness.listAssignments }));

import { TeacherClassPage } from "./TeacherClassPage";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const dialog = (title: string) => Array.from(container.querySelectorAll("dialog")).find((element) => element.textContent?.includes(title)) as HTMLDialogElement;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  history.replaceState({}, "", "/teacher/classes/4");
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  harness.getClass.mockResolvedValue({ id: 4, teacher_id: 1, name: "Algorithms", description: "", starts_at: "", ends_at: "" });
  harness.listAssignments.mockResolvedValue([]);
  harness.listClassStudents.mockResolvedValue({
    total_assignments: 3,
    enrolled_students: 2,
    submitted_students: 1,
    graded_students: 1,
    students: [
      { id: 7, full_name: "Nguyen Van A", email: "a@example.test", submitted_assignments: 2, graded_assignments: 1 },
      { id: 8, full_name: null, email: "non.submitter@example.test", submitted_assignments: 0, graded_assignments: 0 },
    ],
  });
  harness.getClassStudent.mockResolvedValue({
    id: 7, full_name: "Nguyen Van A", email: "a@example.test", submitted_assignments: 2, graded_assignments: 1, total_assignments: 3,
    phone: "0900000000", date_of_birth: "2000-01-01", gender: "NAM", address: "Hanoi",
    shared_classes: [{ id: 4, teacher_id: 1, name: "Algorithms", description: "", starts_at: "", ends_at: "" }],
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(<TeacherClassPage />); });
});

afterEach(() => { root.unmount(); container.remove(); });

test("roster leads with the student's name, never a bare student id, and offers a profile action", () => {
  expect(container.textContent).toContain("Nguyen Van A");
  expect(container.textContent).not.toContain("Student #7");
  expect(container.querySelector('[aria-label="Xem hồ sơ của Nguyen Van A"]')).not.toBeNull();
});

test("roster counts come from the backend response, not a client-side recount", () => {
  expect(container.textContent).toContain("2"); // enrolled_students
  expect(container.textContent).toContain("Đã nộp 1"); // submitted_students
  expect(container.textContent).toContain("Đã chấm 1"); // graded_students
});

test("a student who has not submitted visibly shows 0 / total", () => {
  expect(container.textContent).toContain("0 / 3");
});

test("selecting the profile action opens a read-only profile dialog fed by the student detail endpoint", async () => {
  await act(async () => { (container.querySelector('[aria-label="Xem hồ sơ của Nguyen Van A"]') as HTMLButtonElement).click(); });

  expect(harness.getClassStudent).toHaveBeenCalledWith(4, 7);
  const profile = dialog("Nguyen Van A");
  expect(profile.open).toBe(true);
  expect(profile.textContent).toContain("0900000000");
  expect(profile.textContent).toContain("Hanoi");
  expect(profile.textContent).toContain("Algorithms");
});
