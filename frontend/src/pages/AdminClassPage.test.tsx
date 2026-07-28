// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const harness = vi.hoisted(() => ({ getClass: vi.fn(), listClassStudents: vi.fn(), listEnrolledStudents: vi.fn(), replaceEnrollment: vi.fn() }));
vi.mock("../classes", () => harness);

let AdminClassPage: typeof import("./AdminClassPage")["AdminClassPage"];

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const click = (label: string) => (Array.from(container.querySelectorAll("button")).find((button) => button.textContent === label) as HTMLButtonElement).click();
const dialog = (title: string) => Array.from(container.querySelectorAll("dialog")).find((element) => element.textContent?.includes(title)) as HTMLDialogElement;
const enrolled = { id: 7, full_name: "An", email: "an@example.test" };
const candidate = { id: 8, full_name: "Linh", email: "linh@example.test" };

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  harness.getClass.mockResolvedValue({ id: 4, teacher_id: 1, name: "Algorithms", description: "", starts_at: "", ends_at: "" });
  harness.listEnrolledStudents.mockResolvedValue([enrolled]);
  harness.listClassStudents.mockResolvedValue([enrolled, candidate]);
  history.replaceState({}, "", "/admin/classes/4");
  ({ AdminClassPage } = await import("./AdminClassPage"));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(<AdminClassPage />); await Promise.resolve(); });
});

afterEach(() => { root.unmount(); container.remove(); });

test("editing the roster searches active Students, prechecks members, saves once, and preserves a rejected draft", async () => {
  harness.listClassStudents.mockReset().mockResolvedValueOnce([enrolled, candidate]).mockResolvedValueOnce([candidate]);
  harness.replaceEnrollment.mockRejectedValueOnce({ detail: "Student has a submission." });

  const roster = container.querySelector("section ul");
  expect(roster?.textContent).toContain("An");
  expect(roster?.textContent).not.toContain("Linh");
  expect(harness.listEnrolledStudents).toHaveBeenCalledWith(4, "");

  await act(async () => { click("Edit roster"); await Promise.resolve(); });
  const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
  expect(checkboxes.map((input) => [input.value, input.checked])).toEqual([["7", true], ["8", false]]);
  await act(async () => { checkboxes[0].click(); checkboxes[1].click(); });

  const search = container.querySelector('input[type="search"]') as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "Linh");
  await act(async () => { search.dispatchEvent(new Event("input", { bubbles: true })); await Promise.resolve(); });
  expect(harness.listClassStudents).toHaveBeenLastCalledWith(4, "Linh");

  await act(async () => { click("Save roster"); await Promise.resolve(); });
  expect(harness.replaceEnrollment).toHaveBeenCalledTimes(1);
  expect(harness.replaceEnrollment).toHaveBeenCalledWith(4, [8]);
  expect(dialog("Edit roster").open).toBe(true);
  expect((container.querySelector('input[value="8"]') as HTMLInputElement).checked).toBe(true);
  expect(container.textContent).toContain("Student has a submission.");
});
