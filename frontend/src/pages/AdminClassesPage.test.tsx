import { expect, test } from "vitest";

test("Admin Class screens use a Teacher selector and omit Class deletion", () => {
  const pages = (import.meta as ImportMeta & { glob: (pattern: string, options: object) => Record<string, string> }).glob("./{AdminClassesPage,AdminClassPage}.tsx", { eager: true, query: "?raw", import: "default" });
  const source = Object.values(pages).join("\n");

  expect(source).toContain("Teacher");
  expect(source).toContain("Edit roster");
  expect(source).toContain("?edit=${class_.id}");
  expect(source).not.toContain("Delete Class");
});
