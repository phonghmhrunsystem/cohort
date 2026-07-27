import { beforeEach, expect, test, vi } from "vitest";

import { canAccess, clearSession, roleHome, startSession } from "./session";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});

test("session keeps only the access token", () => {
  startSession("access-token");
  expect(sessionStorage.getItem("accessToken")).toBe("access-token");
  clearSession();
  expect(sessionStorage.getItem("accessToken")).toBeNull();
});

test("unknown paths and wrong roles are not allowed", () => {
  expect(canAccess("/missing", "ADMIN")).toBe(false);
  expect(canAccess("/teacher/cohorts", "STUDENT")).toBe(false);
});

test("roleHome sends every role to its workspace", () => {
  expect(roleHome("ADMIN")).toBe("/admin/users");
  expect(roleHome("TEACHER")).toBe("/teacher/cohorts");
  expect(roleHome("STUDENT")).toBe("/student/cohorts");
});
