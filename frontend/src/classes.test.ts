import { expect, test, vi } from "vitest";

vi.mock("./api", () => ({ api: vi.fn() }));

import { api } from "./api";
import { listClasses, replaceEnrollment } from "./classes";

test("listClasses passes its search query to the Class API", async () => {
  vi.mocked(api).mockResolvedValue([]);

  await expect(listClasses("python")).resolves.toEqual([]);
  expect(api).toHaveBeenCalledWith("/classes?q=python");
});

test("replaceEnrollment sends the complete Student roster in one PUT", async () => {
  vi.mocked(api).mockResolvedValue([]);

  await replaceEnrollment(4, [7, 8]);

  expect(api).toHaveBeenCalledWith("/classes/4/enrollments", { method: "PUT", headers: { "Content-Type": "application/json" }, body: '{"student_ids":[7,8]}' });
});
