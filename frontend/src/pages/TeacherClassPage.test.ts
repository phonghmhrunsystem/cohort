import { expect, test } from "vitest";

import { normalizeTeacherClassTab } from "./TeacherClassPage";

test("Teacher Class tabs normalize missing or invalid values to the read-only students tab", () => {
  expect(normalizeTeacherClassTab(null)).toBe("students");
  expect(normalizeTeacherClassTab("invalid")).toBe("students");
  expect(normalizeTeacherClassTab("assignments")).toBe("assignments");
});
