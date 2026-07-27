import { expect, test, vi } from "vitest";

vi.mock("./api", () => ({ api: vi.fn() }));

import { api } from "./api";
import { createAssignment, replaceRubric, updateAssignment } from "./assignments";

test("assignment helpers send teacher coursework payloads to their scoped endpoints", async () => {
  vi.mocked(api).mockResolvedValue({});
  const draft = { title: "Project", description: "Build a documented project.", due_at: "2026-08-01T12:00:00Z" };

  await createAssignment(7, draft);
  await updateAssignment(9, { title: "Updated" });
  await replaceRubric(9, [{ title: "Code", maximum_score: 100 }]);

  expect(api).toHaveBeenNthCalledWith(1, "/classes/7/assignments", expect.objectContaining({ method: "POST", body: JSON.stringify(draft) }));
  expect(api).toHaveBeenNthCalledWith(2, "/assignments/9", expect.objectContaining({ method: "PATCH" }));
  expect(api).toHaveBeenNthCalledWith(3, "/assignments/9/rubric", expect.objectContaining({ method: "PUT", body: JSON.stringify({ criteria: [{ title: "Code", maximum_score: 100 }] }) }));
});
