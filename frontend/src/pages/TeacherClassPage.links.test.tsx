import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

const harness = vi.hoisted(() => ({ index: 0, states: [] as unknown[] }));

vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return { ...actual, useEffect: vi.fn(), useState: <T,>(initial: T) => [harness.index < harness.states.length ? harness.states[harness.index++] as T : initial, vi.fn()] as const };
});

import { TeacherClassPage } from "./TeacherClassPage";

test("teacher assignment cards link to their latest-submissions page", () => {
  vi.stubGlobal("location", { pathname: "/teacher/classes/4", search: "?tab=assignments" });
  harness.index = 0;
  harness.states = [
    { id: 4, teacher_id: 1, name: "Algorithms", description: "", starts_at: "2026-07-01T00:00:00Z", ends_at: "2026-08-01T00:00:00Z" }, [],
    [{ id: 9, classroom_id: 4, title: "Essay", description: "", due_at: "2026-07-30T00:00:00Z", maximum_score: 100, criteria: [] }], "assignments", "", { title: "", description: "", due_at: "" }, null, null, [], null, "", false,
  ];

  expect(renderToStaticMarkup(<TeacherClassPage />)).toContain('href="/teacher/assignments/9"');
});
