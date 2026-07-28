import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

import { downloadSubmission, LatestSubmissions } from "./LatestSubmissions";

beforeEach(() => {
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => key === "access_token" ? "token-123" : null });
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:file"), revokeObjectURL: vi.fn() });
  vi.stubGlobal("document", { createElement: vi.fn(() => ({ click: vi.fn() })) });
});

test("latest submissions identifies the student and exposes one protected download action", () => {
  const html = renderToStaticMarkup(<LatestSubmissions submissions={[
    { id: 2, student_id: 7, version: 2, original_filename: "essay-v2.docx", created_at: "2026-07-28T01:00:00Z" },
  ]} />);

  expect(html).toContain("Student #7");
  expect(html).toContain("Version 2");
  expect(html).toContain("Download essay-v2.docx");
});

test("download fetches the protected endpoint with the session JWT", async () => {
  const fetchSpy = vi.fn().mockResolvedValue(new Response("file", { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);

  await downloadSubmission(2, "essay-v2.docx");

  expect(fetchSpy).toHaveBeenCalledWith("/api/submissions/2/download", { headers: { Authorization: "Bearer token-123" } });
});
