import { beforeEach, expect, test, vi } from "vitest";

import { api } from "./api";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("sessionStorage", {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});

test("api sends the session access token", async () => {
  sessionStorage.setItem("accessToken", "token-123");
  const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);

  await expect(api<{ status: string }>("/health")).resolves.toEqual({ status: "ok" });
  const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
  expect(fetchSpy).toHaveBeenCalledWith("/api/health", expect.anything());
  expect(new Headers(options.headers).get("Authorization")).toBe("Bearer token-123");
});

test("api throws the response status and detail", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Forbidden" }), { status: 403 })));

  await expect(api("/protected")).rejects.toEqual({ status: 403, detail: "Forbidden" });
});

test("api accepts a successful 204 response without a body", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

  await expect(api<void>("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
});

test("api exposes 422 field errors", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ email: ["Enter a valid email address."] }), { status: 422 })));

  await expect(api("/auth/login")).rejects.toEqual({
    status: 422,
    detail: "Request failed.",
    fields: { email: ["Enter a valid email address."] },
  });
});

test("a 401 clears the stale token and redirects to login", async () => {
  const assign = vi.fn();
  sessionStorage.setItem("accessToken", "stale-token");
  vi.stubGlobal("location", { assign });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Expired" }), { status: 401 })));

  await expect(api("/auth/me")).rejects.toEqual({ status: 401, detail: "Expired" });
  expect(sessionStorage.getItem("accessToken")).toBeNull();
  expect(assign).toHaveBeenCalledWith("/login");
});
