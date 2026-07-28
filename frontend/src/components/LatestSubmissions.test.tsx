import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

import { downloadSubmission, LatestSubmissions } from "./LatestSubmissions";

beforeEach(() => {
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => key === "access_token" ? "token-123" : null });
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:file"), revokeObjectURL: vi.fn() });
  vi.stubGlobal("document", { createElement: vi.fn(() => ({ click: vi.fn() })) });
});

const submission = { id: 2, assignment_id: 5, student_id: 7, student_name: "Nguyen Van A", version: 2, original_filename: "essay-v2.docx", created_at: "2026-07-28T01:00:00Z", graded: false };

test("latest submissions leads with the student's name, then filename and submitted time, and version only as supporting history", () => {
  const html = renderToStaticMarkup(<LatestSubmissions submissions={[submission]} />);

  expect(html).toContain("Nguyen Van A");
  expect(html).not.toContain("Student #7");
  const nameIndex = html.indexOf("Nguyen Van A");
  const filenameIndex = html.indexOf("essay-v2.docx");
  const versionIndex = html.indexOf("Version 2");
  expect(nameIndex).toBeGreaterThanOrEqual(0);
  expect(filenameIndex).toBeGreaterThan(nameIndex);
  expect(versionIndex).toBeGreaterThan(filenameIndex);
  expect(html).toContain('href="/teacher/assignments/5/submissions/2/grade"');
});

test("a submission with no student_name falls back to Student #id", () => {
  const html = renderToStaticMarkup(<LatestSubmissions submissions={[{ ...submission, student_name: null }]} />);

  expect(html).toContain("Student #7");
});

test("an ungraded submission offers a Chấm điểm action", () => {
  const html = renderToStaticMarkup(<LatestSubmissions submissions={[submission]} />);

  expect(html).toContain("Chấm điểm");
  expect(html).not.toContain("Đã chấm");
});

test("a graded submission shows Đã chấm instead of a grading link", () => {
  const html = renderToStaticMarkup(<LatestSubmissions submissions={[{ ...submission, graded: true }]} />);

  expect(html).toContain("Đã chấm");
  expect(html).not.toContain("Chấm điểm");
  expect(html).not.toContain('href="/teacher/assignments/5/submissions/2/grade"');
});

test("download fetches the protected endpoint with the session JWT", async () => {
  const fetchSpy = vi.fn().mockResolvedValue(new Response("file", { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);

  await downloadSubmission(2, "essay-v2.docx");

  expect(fetchSpy).toHaveBeenCalledWith("/api/submissions/2/download", { headers: { Authorization: "Bearer token-123" } });
});
