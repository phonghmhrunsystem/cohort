import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { SubmissionHistory } from "./SubmissionHistory";

test("submission history shows every submitted version with its note", () => {
  const html = renderToStaticMarkup(<SubmissionHistory submissions={[
    { id: 2, version: 2, original_filename: "essay-v2.docx", note: "Fixed citations", created_at: "2026-07-28T01:00:00Z" },
    { id: 1, version: 1, original_filename: "essay.pdf", note: "", created_at: "2026-07-27T01:00:00Z" },
  ]} />);

  expect(html).toContain("Version 2");
  expect(html).toContain("essay-v2.docx");
  expect(html).toContain("Fixed citations");
  expect(html).toContain("Version 1");
});
