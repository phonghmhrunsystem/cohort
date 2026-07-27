import { accessToken, redirectToLogin } from "./session";

export type ApiFailure = { status: number; detail: string; fields?: Record<string, string[]> };
export type ApiResponse<T> = { status: number; data: T };

export async function apiResponse<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
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
  return { status: response.status, data: response.status === 204 ? undefined as T : await response.json() as T };
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  return (await apiResponse<T>(path, options)).data;
}
