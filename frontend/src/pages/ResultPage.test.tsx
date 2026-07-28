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

import { ResultPage } from "./ResultPage";

const rubricAssignment = { id: 1, classroom_id: 1, title: "Essay", description: "", due_at: "2026-08-01T00:00:00Z", maximum_score: 100, criteria: [
  { id: 10, title: "Correctness", maximum_score: 60 },
  { id: 11, title: "Style", maximum_score: 40 },
] };

const manualAssignment = { ...rubricAssignment, criteria: [] };

function render(states: unknown[]) {
  harness.index = 0; harness.states = states;
  return renderToStaticMarkup(ResultPage({ assignmentId: 1 }));
}

test("still loading while assignment/grade have not resolved", () => {
  const html = render([undefined, undefined, ""]);

  expect(html).toContain("Loading…");
});

test("a 404 my-result (grade === null) renders as not graded yet, not an error", () => {
  const html = render([manualAssignment, null, ""]);

  expect(html).toContain("Not graded yet.");
  expect(html).not.toContain("alert-danger");
});

test("a graded rubric assignment renders the per-criterion breakdown matched by criterion_id", () => {
  const grade = { id: 1, assignment_id: 1, student_id: 2, submission_id: 5, total_score: 55, feedback: "Nice", scores: [{ criterion_id: 10, score: 55 }], created_at: "2026-07-28T00:00:00Z" };
  const html = render([rubricAssignment, grade, ""]);

  expect(html).toContain("Total score: 55");
  expect(html).toContain("Nice");
  expect(html).toContain("Correctness: 55 / 60");
  // no score entry for criterion 11 -> defaults to 0
  expect(html).toContain("Style: 0 / 40");
});

test("a graded manual (non-rubric) assignment shows the total but no breakdown list", () => {
  const grade = { id: 1, assignment_id: 1, student_id: 2, submission_id: 5, total_score: 88, feedback: "Well done", scores: [], created_at: "2026-07-28T00:00:00Z" };
  const html = render([manualAssignment, grade, ""]);

  expect(html).toContain("Total score: 88 / 100");
  expect(html).not.toContain("list-group");
});
