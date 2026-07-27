import { expect, test } from "vitest";

import { normalizeTeacherClassTab, toLocalDateTime, toUtcIso } from "./TeacherClassPage";

test("Teacher Class tabs normalize missing or invalid values to the read-only students tab", () => {
  expect(normalizeTeacherClassTab(null)).toBe("students");
  expect(normalizeTeacherClassTab("invalid")).toBe("students");
  expect(normalizeTeacherClassTab("assignments")).toBe("assignments");
});

test.each(["2026-01-15T12:34:56.789Z", "2026-01-15T12:34:56.005Z"])("assignment edit datetime %s round-trips without changing the instant", (instant) => {
  const local = new Date(instant);
  const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}T${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}:${String(local.getSeconds()).padStart(2, "0")}.${String(local.getMilliseconds()).padStart(3, "0")}`;

  expect(toLocalDateTime(instant)).toBe(expected);
  expect(toUtcIso(toLocalDateTime(instant))).toBe(instant);
});
