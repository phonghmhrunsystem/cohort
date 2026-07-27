import { beforeEach, expect, test, vi } from "vitest";

vi.mock("./api", () => ({ api: vi.fn() }));

import { api } from "./api";
import { login, logout } from "./auth";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("sessionStorage", {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.mocked(api).mockReset();
});

test("login stores the access token and returns the user from the login response", async () => {
  const user = { id: 1, email: "admin@example.com", role: "ADMIN", is_active: true } as const;
  vi.mocked(api).mockResolvedValueOnce({ access_token: "access-token", user });

  await expect(login("admin@example.com", "correct-password")).resolves.toEqual(user);
  expect(sessionStorage.getItem("accessToken")).toBe("access-token");
  expect(api).toHaveBeenNthCalledWith(1, "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "correct-password" }),
  });
  expect(api).toHaveBeenCalledTimes(1);
});

test("logout clears the token when the logout request fails", async () => {
  sessionStorage.setItem("accessToken", "stale-token");
  vi.mocked(api).mockRejectedValueOnce({ status: 500, detail: "Unable to log out." });

  await expect(logout()).rejects.toEqual({ status: 500, detail: "Unable to log out." });
  expect(sessionStorage.getItem("accessToken")).toBeNull();
});
