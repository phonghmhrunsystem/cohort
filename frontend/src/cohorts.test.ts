import { expect, test, vi } from "vitest";

vi.mock("./api", () => ({ api: vi.fn() }));

import { api } from "./api";
import { listStudentAccounts } from "./cohorts";

test("listStudentAccounts keeps only Student accounts for enrollment", async () => {
  vi.mocked(api).mockResolvedValue([
    { id: 1, email: "teacher@example.test", role: "TEACHER", is_active: true },
    { id: 2, email: "student@example.test", role: "STUDENT", is_active: true },
  ]);

  await expect(listStudentAccounts()).resolves.toEqual([
    { id: 2, email: "student@example.test", role: "STUDENT", is_active: true },
  ]);
  expect(api).toHaveBeenCalledWith("/users");
});

test("cohort pages do not contain mojibake", () => {
  const pages = (import.meta as ImportMeta & { glob: (pattern: string, options: object) => Record<string, string> }).glob("./pages/{TeacherCohortsPage,StudentCohortsPage,CohortPage}.tsx", { eager: true, query: "?raw", import: "default" });
  for (const source of Object.values(pages)) {
    expect(source).not.toMatch(/[Ãâ]/);
  }
});
