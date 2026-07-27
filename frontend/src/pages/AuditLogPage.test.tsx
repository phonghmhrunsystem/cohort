import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const harness = vi.hoisted(() => ({
  api: vi.fn(),
  index: 0,
  states: [] as unknown[],
}));

vi.mock("../api", () => ({ api: harness.api }));
vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return {
    ...actual,
    useEffect: vi.fn(),
    useState: <T,>(initial: T) => {
      const index = harness.index++;
      return [index < harness.states.length ? harness.states[index] : initial, vi.fn()];
    },
  };
});

import { AuditLogPage } from "./AuditLogPage";

function render(states: unknown[]) {
  harness.index = 0;
  harness.states = states;
  return renderToStaticMarkup(AuditLogPage());
}

beforeEach(() => {
  harness.api.mockReset();
});

test.each([
  [[[], "", true], "Loading audit log…"],
  [[[], "", false], "No audit entries yet."],
  [[[], "Audit service unavailable.", false], "Audit service unavailable."],
])("renders the audit request state", (states, message) => {
  expect(render(states)).toContain(message);
});

test("renders one responsive audit table and never renders sensitive metadata", () => {
  const html = render([[
    {
      id: 1,
      actor_id: 2,
      actor: { id: 2, full_name: "Admin User", email: "admin@example.test" },
      action: "account.updated",
      target_type: "accounts.user",
      target_id: 7,
      metadata: {
        score: 95,
        password: "secret-password",
        access_token: "secret-token",
        raw_file_data: "raw-data",
        storage_path: "C:\\private\\submission.pdf",
      },
      created_at: "2026-07-27T08:00:00Z",
    },
  ], "", false]);

  expect(html.match(/table-responsive/g)).toHaveLength(1);
  expect(html).toContain("Admin User");
  expect(html).toContain("account.updated");
  expect(html).toContain("score");
  expect(html).not.toMatch(/secret-password|secret-token|raw-data|private|storage_path/);
});
