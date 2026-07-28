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
const hiddenMember = { id: 9, full_name: "Bao", email: "bao@example.test" };
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
  let rejectSearch!: (reason?: unknown) => void;
  harness.listClassStudents.mockReset()
    .mockResolvedValueOnce([enrolled, candidate])
    .mockReturnValueOnce(new Promise<Array<typeof candidate>>((_resolve, reject) => { rejectSearch = reject; }));
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

  await act(async () => { rejectSearch({ detail: "Old search failed." }); await Promise.resolve(); });
  expect(container.textContent).toContain("Student has a submission.");
  expect(container.textContent).not.toContain("Old search failed.");
});

test("editing after a roster search retains members outside the page filter", async () => {
  harness.listEnrolledStudents.mockImplementation((_id: number, query = "") => Promise.resolve(query ? [enrolled] : [enrolled, hiddenMember]));
  harness.listClassStudents.mockResolvedValue([enrolled, hiddenMember, candidate]);
  harness.replaceEnrollment.mockResolvedValue([enrolled, hiddenMember]);

  const rosterSearch = container.querySelector("section input") as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(rosterSearch, "An");
  await act(async () => { rosterSearch.dispatchEvent(new Event("input", { bubbles: true })); await Promise.resolve(); await Promise.resolve(); });
  expect(harness.listEnrolledStudents).toHaveBeenLastCalledWith(4, "An");

  await act(async () => { click("Edit roster"); await Promise.resolve(); });
  const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
  expect(checkboxes.map((input) => [input.value, input.checked])).toEqual([["7", true], ["9", true], ["8", false]]);

  await act(async () => { click("Save roster"); await Promise.resolve(); });
  expect(harness.replaceEnrollment).toHaveBeenCalledWith(4, [7, 9]);
});

test("editing waits for the full roster before allowing a save", async () => {
  let resolveRoster!: (students: Array<typeof enrolled>) => void;
  harness.listEnrolledStudents.mockReset().mockReturnValue(new Promise<Array<typeof enrolled>>((resolve) => { resolveRoster = resolve; }));
  harness.listClassStudents.mockResolvedValue([enrolled, candidate]);

  await act(async () => { click("Edit roster"); await Promise.resolve(); });
  const save = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Save roster") as HTMLButtonElement;
  const search = container.querySelector('input[type="search"]') as HTMLInputElement;
  expect(save.disabled).toBe(true);
  expect(search.disabled).toBe(true);
  await act(async () => { save.click(); });
  expect(harness.replaceEnrollment).not.toHaveBeenCalled();

  await act(async () => { resolveRoster([enrolled]); await Promise.resolve(); });
  expect(save.disabled).toBe(false);
  expect(search.disabled).toBe(false);
});

test("reopening the roster ignores the previous dialog load", async () => {
  let resolveFirst!: (students: Array<typeof enrolled>) => void;
  let resolveSecond!: (students: Array<typeof hiddenMember>) => void;
  harness.listEnrolledStudents.mockReset()
    .mockReturnValueOnce(new Promise<Array<typeof enrolled>>((resolve) => { resolveFirst = resolve; }))
    .mockReturnValueOnce(new Promise<Array<typeof hiddenMember>>((resolve) => { resolveSecond = resolve; }));
  harness.listClassStudents.mockReset()
    .mockResolvedValueOnce([enrolled])
    .mockResolvedValueOnce([hiddenMember, candidate]);

  await act(async () => { click("Edit roster"); });
  await act(async () => { click("Cancel"); });
  await act(async () => { click("Edit roster"); });
  const save = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Save roster") as HTMLButtonElement;

  await act(async () => { resolveFirst([enrolled]); await Promise.resolve(); });
  expect(save.disabled).toBe(true);

  await act(async () => { resolveSecond([hiddenMember]); await Promise.resolve(); });
  expect(save.disabled).toBe(false);
  expect(Array.from(container.querySelectorAll('input[type="checkbox"]')).map((input) => [(input as HTMLInputElement).value, (input as HTMLInputElement).checked]))
    .toEqual([["9", true], ["8", false]]);
});

test("a search from a closed roster cannot replace reopened candidates", async () => {
  let resolveSearch!: (students: Array<typeof candidate>) => void;
  harness.listEnrolledStudents.mockReset()
    .mockResolvedValueOnce([enrolled])
    .mockResolvedValueOnce([hiddenMember]);
  harness.listClassStudents.mockReset()
    .mockResolvedValueOnce([enrolled, candidate])
    .mockReturnValueOnce(new Promise<Array<typeof candidate>>((resolve) => { resolveSearch = resolve; }))
    .mockResolvedValueOnce([hiddenMember]);

  await act(async () => { click("Edit roster"); await Promise.resolve(); });
  const search = container.querySelector('input[type="search"]') as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "Linh");
  await act(async () => { search.dispatchEvent(new Event("input", { bubbles: true })); await Promise.resolve(); });
  await act(async () => { click("Cancel"); });
  await act(async () => { click("Edit roster"); await Promise.resolve(); });
  expect(Array.from(container.querySelectorAll('input[type="checkbox"]')).map((input) => [(input as HTMLInputElement).value, (input as HTMLInputElement).checked]))
    .toEqual([["9", true]]);

  await act(async () => { resolveSearch([candidate]); await Promise.resolve(); });
  expect(Array.from(container.querySelectorAll('input[type="checkbox"]')).map((input) => [(input as HTMLInputElement).value, (input as HTMLInputElement).checked]))
    .toEqual([["9", true]]);
});

test("only the latest search can update roster candidates", async () => {
  let resolveFirst!: (students: Array<typeof candidate>) => void;
  let resolveSecond!: (students: Array<typeof hiddenMember>) => void;
  harness.listEnrolledStudents.mockReset().mockResolvedValue([enrolled]);
  harness.listClassStudents.mockReset()
    .mockResolvedValueOnce([enrolled, candidate])
    .mockReturnValueOnce(new Promise<Array<typeof candidate>>((resolve) => { resolveFirst = resolve; }))
    .mockReturnValueOnce(new Promise<Array<typeof hiddenMember>>((resolve) => { resolveSecond = resolve; }));

  await act(async () => { click("Edit roster"); await Promise.resolve(); });
  const search = container.querySelector('input[type="search"]') as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "Linh");
  await act(async () => { search.dispatchEvent(new Event("input", { bubbles: true })); });
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "Bao");
  await act(async () => { search.dispatchEvent(new Event("input", { bubbles: true })); });

  await act(async () => { resolveSecond([hiddenMember]); await Promise.resolve(); });
  expect(Array.from(container.querySelectorAll('input[type="checkbox"]')).map((input) => (input as HTMLInputElement).value)).toEqual(["9"]);
  await act(async () => { resolveFirst([candidate]); await Promise.resolve(); });
  expect(Array.from(container.querySelectorAll('input[type="checkbox"]')).map((input) => (input as HTMLInputElement).value)).toEqual(["9"]);
});

test("a failed reopen cannot use a roster that settled after cancellation", async () => {
  let resolveFirst!: (students: Array<typeof enrolled>) => void;
  harness.listEnrolledStudents.mockReset()
    .mockReturnValueOnce(new Promise<Array<typeof enrolled>>((resolve) => { resolveFirst = resolve; }))
    .mockRejectedValueOnce({ detail: "Unable to load roster." });
  harness.listClassStudents.mockReset()
    .mockResolvedValueOnce([enrolled])
    .mockResolvedValueOnce([enrolled]);

  await act(async () => { click("Edit roster"); });
  await act(async () => { click("Cancel"); });
  await act(async () => { resolveFirst([enrolled]); await Promise.resolve(); });
  await act(async () => { click("Edit roster"); await Promise.resolve(); await Promise.resolve(); });
  expect(container.textContent).toContain("Unable to load roster.");
  const save = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Save roster") as HTMLButtonElement;
  const search = container.querySelector('input[type="search"]') as HTMLInputElement;
  expect({
    saveDisabled: save.disabled,
    searchDisabled: search.disabled,
    checkedIds: Array.from(container.querySelectorAll('input[type="checkbox"]'))
      .filter((input) => (input as HTMLInputElement).checked)
      .map((input) => (input as HTMLInputElement).value),
  }).toEqual({ saveDisabled: true, searchDisabled: true, checkedIds: [] });
});
