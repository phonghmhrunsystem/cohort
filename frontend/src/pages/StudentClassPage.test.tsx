import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

const harness = vi.hoisted(() => {
  vi.stubGlobal("location", { pathname: "/student/classes/4" });
  return {
    class_: { id: 4, teacher_id: 1, teacher: { id: 1, full_name: "Teacher Example", email: "teacher@example.test" }, name: "Algorithms", description: "", starts_at: "2026-07-01T00:00:00Z", ends_at: "2026-08-01T00:00:00Z" },
    assignments: [{ id: 9, classroom_id: 4, title: "Essay", description: "", due_at: "2026-07-30T00:00:00Z", maximum_score: 100, criteria: [] }],
  };
});

vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return { ...actual, useEffect: vi.fn(), useState: <T,>(initial: T) => [initial === undefined ? harness.class_ as T : Array.isArray(initial) ? harness.assignments as T : initial, vi.fn()] as const };
});

import { StudentClassPage } from "./StudentClassPage";

test("student class assignments link to the student submission page", () => {
  const html = renderToStaticMarkup(<StudentClassPage />);

  expect(html).toContain(">Quay lại</button>");
  expect(html).not.toContain(">My Classes</a>");
  expect(html).toContain('href="/student/assignments/9"');
});

test("student class shows the enrolled class teacher as read-only contact information", () => {
  const html = renderToStaticMarkup(<StudentClassPage />);

  expect(html).toContain("Giáo viên");
  expect(html).toContain("teacher@example.test");
  expect(html).not.toContain("Edit teacher");
});
