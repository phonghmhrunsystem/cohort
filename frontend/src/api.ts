import { accessToken, redirectToLogin } from "./session";

export type ApiFailure = { status: number; detail: string; fields?: Record<string, string[]> };

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = accessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`/api${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    const fields = Object.fromEntries(Object.entries(body).filter(([key, value]) => key !== "detail" && Array.isArray(value))) as Record<string, string[]>;
    const failure: ApiFailure = { status: response.status, detail: typeof body.detail === "string" ? body.detail : "Request failed.", ...(Object.keys(fields).length ? { fields } : {}) };
    if (response.status === 401) redirectToLogin();
    throw failure;
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
