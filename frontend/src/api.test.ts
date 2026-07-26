import { beforeEach, expect, test, vi } from "vitest";

import { api } from "./api";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("sessionStorage", {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
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
