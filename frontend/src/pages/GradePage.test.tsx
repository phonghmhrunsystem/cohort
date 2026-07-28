import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

const harness = vi.hoisted(() => ({ index: 0, states: [] as unknown[] }));

vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return { ...actual, useEffect: vi.fn(), useState: <T,>(initial: T) => {
    const index = harness.index++;
    return [index < harness.states.length ? harness.states[index] as T : initial, vi.fn()] as const;
  } };
});

import { GradePage } from "./GradePage";

const rubricAssignment = { id: 1, classroom_id: 1, title: "Essay", description: "", due_at: "2026-08-01T00:00:00Z", maximum_score: 100, criteria: [
  { id: 10, title: "Correctness", maximum_score: 60 },
  { id: 11, title: "Style", maximum_score: 40 },
] };

const manualAssignment = { ...rubricAssignment, criteria: [] };
const submission = { id: 5, assignment_id: 1, student_id: 2, student_name: "Nguyen Van A", version: 1, original_filename: "essay.pdf", created_at: "2026-07-27T00:00:00Z", graded: false };

function render(states: unknown[]) {
  harness.index = 0; harness.states = states;
  return renderToStaticMarkup(GradePage({ assignmentId: 1, submissionId: 5 }));
}

test("rubric assignment renders one required number input per criterion", () => {
  const html = render([rubricAssignment, submission, { 10: 0, 11: 0 }, 0, "", null, "", false]);

  expect(html).toContain("Correctness (0-60)");
  expect(html).toContain("Style (0-40)");
  expect(html).not.toContain("Total score (0-100)");
  expect((html.match(/type="number"/g) ?? []).length).toBe(2);
});

test("assignment with no rubric renders a single manual total input", () => {
  const html = render([manualAssignment, submission, {}, 0, "", null, "", false]);

  expect(html).toContain("Total score (0-100)");
  expect(html).not.toContain("Correctness");
  expect((html.match(/type="number"/g) ?? []).length).toBe(1);
});

test("the grading view leads with the student's name, then filename/submitted time, and version only as supporting text", () => {
  const html = render([rubricAssignment, submission, { 10: 0, 11: 0 }, 0, "", null, "", false]);

  const nameIndex = html.indexOf("Nguyen Van A");
  const filenameIndex = html.indexOf("essay.pdf");
  const versionIndex = html.indexOf("Version 1");
  expect(nameIndex).toBeGreaterThanOrEqual(0);
  expect(filenameIndex).toBeGreaterThan(nameIndex);
  expect(versionIndex).toBeGreaterThan(filenameIndex);
  expect(html).toContain("Chấm điểm");
});

test("a submission with no student_name falls back to Student #id", () => {
  const html = render([rubricAssignment, { ...submission, student_name: null }, { 10: 0, 11: 0 }, 0, "", null, "", false]);

  expect(html).toContain("Student #2");
});

test("after a grade is saved the confirmation replaces the form", () => {
  const grade = { id: 1, assignment_id: 1, student_id: 2, submission_id: 5, total_score: 90, feedback: "Good work", scores: [], created_at: "2026-07-28T00:00:00Z" };
  const html = render([rubricAssignment, submission, { 10: 0, 11: 0 }, 0, "", grade, "", false]);

  expect(html).toContain("Đã chấm");
  expect(html).toContain("Total score: 90");
  expect(html).toContain("Good work");
  expect(html).not.toContain("<form");
});

test("a submission that is already graded shows Đã chấm instead of the grading form", () => {
  const html = render([rubricAssignment, { ...submission, graded: true }, { 10: 0, 11: 0 }, 0, "", null, "", false]);

  expect(html).toContain("Đã chấm");
  expect(html).not.toContain("<form");
});
