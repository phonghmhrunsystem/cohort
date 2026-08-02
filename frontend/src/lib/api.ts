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
  const isFormData = body instanceof FormData;
  if (body !== undefined && !isFormData) headers["Content-Type"] = "application/json";

  const response = await fetch(`/api${path}`, {
    ...init,
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
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

export function auditLogsPath(page = 1): string {
  return page > 1 ? `/audit-logs?page=${page}` : "/audit-logs";
}

export function classAssignmentsPath(classId: number): string {
  return `/classes/${classId}/assignments`;
}

export function assignmentSubmissionsPath(assignmentId: number): string {
  return `/assignments/${assignmentId}/submissions`;
}

export function submissionDownloadUrl(submissionId: number): string {
  return `/api/submissions/${submissionId}/download`;
}

export function submissionPath(submissionId: number): string {
  return `/submissions/${submissionId}`;
}

export function submissionGradePath(submissionId: number): string {
  return `/submissions/${submissionId}/grade`;
}

export function assignmentMyResultPath(assignmentId: number): string {
  return `/assignments/${assignmentId}/my-result`;
}

export function assignmentStudentResultPath(assignmentId: number, studentId: number): string {
  return `/assignments/${assignmentId}/students/${studentId}/result`;
}

export function classGradebookPath(classId: number): string {
  return `/classes/${classId}/gradebook`;
}

export function gradebookCsvUrl(classId: number): string {
  return `/api/classes/${classId}/gradebook.csv`;
}

/** Downloads are authenticated with the Bearer token, so a plain <a href> cannot
 * be used; fetch the bytes and hand the browser a blob URL instead. */
async function downloadBlob(url: string, suggestedFilename?: string): Promise<void> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${sessionStorage.getItem("access_token") ?? ""}` },
  });
  if (!response.ok) throw new Error("Download failed.");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = suggestedFilename ?? "";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadSubmission(submissionId: number, suggestedFilename?: string): Promise<void> {
  return downloadBlob(submissionDownloadUrl(submissionId), suggestedFilename);
}

export function classResourcePath(classId: number, resourceId: number): string {
  return `/classes/${classId}/resources/${resourceId}`;
}

/** File tài liệu không nằm dưới MEDIA_URL công khai: tải qua endpoint có Bearer
 * nên nó vẫn bị giới hạn trong phạm vi lớp (07 §2.2). */
export async function downloadClassResource(classId: number, resource: { id: number; original_filename: string }): Promise<void> {
  return downloadBlob(`/api/classes/${classId}/resources/${resource.id}/download`, resource.original_filename);
}

export async function downloadGradebookCsv(classId: number): Promise<void> {
  return downloadBlob(gradebookCsvUrl(classId), `gradebook-${classId}.csv`);
}
