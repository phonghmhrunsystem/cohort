import { beforeEach, expect, test, vi } from "vitest";

const harness = vi.hoisted(() => ({ api: vi.fn(), render: vi.fn() }));

vi.mock("./api", () => ({ api: harness.api }));
vi.mock("react-dom/client", () => ({ createRoot: () => ({ render: harness.render }) }));

import { startSession } from "./session";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  harness.api.mockReset();
  harness.render.mockReset();
  vi.resetModules();
  vi.stubGlobal("document", { getElementById: () => ({}) });
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});

test("an unknown route clears the session and redirects to login", async () => {
  const assign = vi.fn();
  startSession("access-token");
  vi.stubGlobal("location", { pathname: "/missing", assign });

  await import("./main");

  expect(sessionStorage.getItem("accessToken")).toBeNull();
  expect(assign).toHaveBeenCalledWith("/login");
});

test("a route for another role clears the session and redirects to login", async () => {
  const assign = vi.fn();
  startSession("access-token");
  harness.api.mockResolvedValue({ id: 1, email: "student@example.test", role: "STUDENT", is_active: true });
  vi.stubGlobal("location", { pathname: "/teacher/cohorts", assign });

  await import("./main");
  await Promise.resolve();

  expect(sessionStorage.getItem("accessToken")).toBeNull();
  expect(assign).toHaveBeenCalledWith("/login");
});
