import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { AssignmentPage } from "./AssignmentPage";

test("student assignment page provides a PDF or DOCX submission form", () => {
  const html = renderToStaticMarkup(<AssignmentPage assignmentId={3} role="STUDENT" />);

  expect(html).toContain("Submit a file");
  expect(html).toContain('type="file"');
  expect(html).toContain('accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"');
  expect(html).toContain("My submission history");
});

test("teacher assignment page shows latest submissions without an upload form", () => {
  const html = renderToStaticMarkup(<AssignmentPage assignmentId={3} role="TEACHER" />);

  expect(html).toContain("Latest submissions");
  expect(html).not.toContain("Submit a file");
});
