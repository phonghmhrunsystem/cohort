// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const harness = vi.hoisted(() => ({ getClass: vi.fn(), getClassGradebook: vi.fn() }));

vi.mock("../classes", () => ({ getClass: harness.getClass, getClassGradebook: harness.getClassGradebook }));

import { TeacherGradebookPage } from "./TeacherGradebookPage";

const gradebook = {
  assignments: [
    { id: 11, title: "Essay", maximum_score: 100 },
    { id: 12, title: "Quiz", maximum_score: 10 },
  ],
  students: [
    { id: 7, full_name: "Nguyen Van A", email: "a@example.test", grades: [{ assignment_id: 11, learning_state: "GRADED" as const, score: 91 }, { assignment_id: 12, learning_state: "OPEN" as const, score: null }] },
    { id: 8, full_name: "Tran Thi B", email: "b@example.test", grades: [{ assignment_id: 11, learning_state: "SUBMITTED" as const, score: null }, { assignment_id: 12, learning_state: "CLOSED" as const, score: null }] },
  ],
};

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function render(data = gradebook) {
  harness.getClassGradebook.mockResolvedValue(data);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(<TeacherGradebookPage />); });
}

function change(element: HTMLInputElement | HTMLSelectElement, value: string, event: "input" | "change") {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set?.call(element, value);
  element.dispatchEvent(new Event(event, { bubbles: true }));
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  history.replaceState({}, "", "/teacher/classes/4/gradebook");
  harness.getClass.mockResolvedValue({ id: 4, teacher_id: 1, name: "Algorithms", description: "", starts_at: "", ends_at: "" });
});

afterEach(() => { root.unmount(); container.remove(); });

test("filters returned gradebook rows by student name and assignment state without another request", async () => {
  await render();
  const name = container.querySelector('input[aria-label="Filter students by name"]') as HTMLInputElement;
  const state = container.querySelector('select[aria-label="Filter by learning state"]') as HTMLSelectElement;

  await act(async () => { change(name, "tran", "input"); });
  expect(container.textContent).toContain("Tran Thi B");
  expect(container.textContent).not.toContain("Nguyen Van A");

  await act(async () => { change(name, "", "input"); change(state, "GRADED", "change"); });
  expect(container.textContent).toContain("Nguyen Van A");
  expect(container.textContent).not.toContain("Tran Thi B");
  expect(harness.getClassGradebook).toHaveBeenCalledTimes(1);
});

test("explains an empty class and a class with no assignments", async () => {
  await render({ assignments: [], students: [] });
  expect(container.textContent).toContain("No enrolled Students.");
  expect(container.textContent).toContain("No assignments yet.");
});

test("keeps enrolled students distinct from a class with no assignments", async () => {
  await render({ assignments: [], students: gradebook.students });
  expect(container.textContent).toContain("No assignments yet.");
  expect(container.textContent).not.toContain("No enrolled Students.");
});

test("offers a CSV download and confines narrow-screen scrolling to the table wrapper", async () => {
  await render();
  expect(container.querySelector('a[href="/api/classes/4/gradebook.csv"]')?.getAttribute("download")).toBe("Algorithms-gradebook.csv");
  expect(container.querySelector(".gradebook-table-wrap")).not.toBeNull();
  expect(container.querySelector(".gradebook-table")).not.toBeNull();
});
