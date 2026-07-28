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

test("session keeps the access token under the browser contract key", () => {
  startSession("access-token");
  expect(sessionStorage.getItem("access_token")).toBe("access-token");
  expect(sessionStorage.getItem("accessToken")).toBeNull();
  clearSession();
  expect(sessionStorage.getItem("access_token")).toBeNull();
});

test("unknown paths and wrong roles are not allowed", () => {
  expect(canAccess("/missing", "ADMIN")).toBe(false);
  expect(canAccess("/teacher/classes", "STUDENT")).toBe(false);
  expect(canAccess("/teacher/classes", "TEACHER")).toBe(true);
});

test("assignment submission routes remain scoped to their classroom role", () => {
  expect(canAccess("/student/assignments/3", "STUDENT")).toBe(true);
  expect(canAccess("/teacher/assignments/3", "TEACHER")).toBe(true);
  expect(canAccess("/student/assignments/3", "TEACHER")).toBe(false);
});

test("Teacher and Student can open their personal profile", () => {
  expect(canAccess("/profile", "TEACHER")).toBe(true);
  expect(canAccess("/profile", "STUDENT")).toBe(true);
});

test("roleHome sends every role to its workspace", () => {
  expect(roleHome("ADMIN")).toBe("/admin/users");
  expect(roleHome("TEACHER")).toBe("/teacher/classes");
  expect(roleHome("STUDENT")).toBe("/student/classes");
});
