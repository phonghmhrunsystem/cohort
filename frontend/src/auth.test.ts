import { beforeEach, expect, test, vi } from "vitest";

vi.mock("./api", () => ({ api: vi.fn() }));

import { api } from "./api";
import { login } from "./auth";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("sessionStorage", {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.mocked(api).mockReset();
});

test("login keeps only the access token and returns the signed-in user", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce({ access: "access-token", refresh: "refresh-token" })
    .mockResolvedValueOnce({ id: 1, email: "admin@example.com", role: "ADMIN", is_active: true });

  await expect(login("admin@example.com", "correct-password")).resolves.toMatchObject({ role: "ADMIN" });
  expect(sessionStorage.getItem("accessToken")).toBe("access-token");
  expect(storage.has("refreshToken")).toBe(false);
  expect(api).toHaveBeenNthCalledWith(1, "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "correct-password" }),
  });
  expect(api).toHaveBeenNthCalledWith(2, "/auth/me");
});
