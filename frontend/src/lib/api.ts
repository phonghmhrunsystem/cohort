import type { ClassFilters, FieldErrors, UserFilters } from "../types";
import { ApiFailure } from "./errors";

type RequestOptions = Omit<RequestInit, "body" | "headers"> & {
  body?: unknown;
  headers?: HeadersInit;
  token?: string;
};

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T | undefined> {
  const { body, headers: providedHeaders, token, ...init } = options;
  const headers = Object.fromEntries(new Headers(providedHeaders));
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`/api${path}`, {
    ...init,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
  });
  const data = response.status !== 204 && response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : undefined;

  if (!response.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : "Request failed.";
    const fieldEntries = data && typeof data === "object" && !Array.isArray(data)
      ? Object.entries(data).filter(
        (entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((value) => typeof value === "string"),
      )
      : [];
    const fields: FieldErrors | undefined = fieldEntries.length ? Object.fromEntries(fieldEntries) : undefined;
    throw new ApiFailure(response.status, fields, detail);
  }

  return data as T | undefined;
}

export function usersPath(filters: UserFilters = {}): string {
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return query.size ? `/users?${query}` : "/users";
}

export function classesPath(filters: ClassFilters = {}): string {
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return query.size ? `/classes?${query}` : "/classes";
}

export function classStudentsPath(classId: number, filters: { q?: string; page?: number } = {}): string {
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return query.size ? `/classes/${classId}/students?${query}` : `/classes/${classId}/students`;
}
