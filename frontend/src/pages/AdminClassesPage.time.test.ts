import { expect, test } from "vitest";

import { toDateTimeLocal, toUtcIso } from "./AdminClassesPage";

test("Class edit timestamps round-trip UTC instants with local seconds", () => {
  const timestamp = "2026-07-28T08:09:10.000Z";

  expect(toDateTimeLocal(timestamp)).toMatch(/^2026-07-28T\d\d:\d\d:\d\d$/);
  expect(toUtcIso(toDateTimeLocal(timestamp))).toBe(timestamp);
});
