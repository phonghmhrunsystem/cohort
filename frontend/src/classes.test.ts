import { expect, test, vi } from "vitest";

vi.mock("./api", () => ({ api: vi.fn() }));

import { api } from "./api";
import { downloadClassGradebook, getClassGradebook, listClasses, replaceEnrollment } from "./classes";

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

test("getClassGradebook reads only the assigned class gradebook endpoint", async () => {
  vi.mocked(api).mockResolvedValue({ assignments: [], students: [] });

  await getClassGradebook(4);

  expect(api).toHaveBeenCalledWith("/classes/4/gradebook");
});

test("gradebook CSV download sends the session JWT to its protected endpoint", async () => {
  vi.stubGlobal("sessionStorage", { getItem: () => "token-123" });
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:file"), revokeObjectURL: vi.fn() });
  vi.stubGlobal("document", { createElement: vi.fn(() => ({ click: vi.fn() })) });
  const fetchSpy = vi.fn().mockResolvedValue(new Response("csv", { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);

  await downloadClassGradebook(4, "Algorithms-gradebook.csv");

  expect(fetchSpy).toHaveBeenCalledWith("/api/classes/4/gradebook.csv", { headers: { Authorization: "Bearer token-123" } });
});
