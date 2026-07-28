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

function render(states: unknown[]) {
  harness.index = 0; harness.states = states;
  return renderToStaticMarkup(GradePage({ assignmentId: 1, submissionId: 5 }));
}

test("rubric assignment renders one required number input per criterion", () => {
  const html = render([rubricAssignment, { 10: 0, 11: 0 }, 0, "", null, "", false]);

  expect(html).toContain("Correctness (0-60)");
  expect(html).toContain("Style (0-40)");
  expect(html).not.toContain("Total score (0-100)");
  expect((html.match(/type="number"/g) ?? []).length).toBe(2);
});

test("assignment with no rubric renders a single manual total input", () => {
  const html = render([manualAssignment, {}, 0, "", null, "", false]);

  expect(html).toContain("Total score (0-100)");
  expect(html).not.toContain("Correctness");
  expect((html.match(/type="number"/g) ?? []).length).toBe(1);
});

test("after a grade is saved the confirmation replaces the form", () => {
  const grade = { id: 1, assignment_id: 1, student_id: 2, submission_id: 5, total_score: 90, feedback: "Good work", scores: [], created_at: "2026-07-28T00:00:00Z" };
  const html = render([rubricAssignment, { 10: 0, 11: 0 }, 0, "", grade, "", false]);

  expect(html).toContain("Saved. Total score: 90");
  expect(html).toContain("Good work");
  expect(html).not.toContain("<form");
});
