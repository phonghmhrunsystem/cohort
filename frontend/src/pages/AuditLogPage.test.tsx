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

test("renders one responsive audit table with only known safe audit metadata", () => {
  const html = render([[
    {
      id: 1,
      actor_id: 2,
      actor: { id: 2, full_name: "Admin User", email: "admin@example.test" },
      action: "account.updated",
      target_type: "accounts.user",
      target_id: 7,
      metadata: {
        is_active: true,
        student_id: 95,
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
  expect(html).toContain('&quot;is_active&quot;:true');
  expect(html).toContain('&quot;student_id&quot;:95');
  expect(html).not.toMatch(/secret-password|secret-token|raw-data|private|storage_path/);
});

test("fails closed for neutral-key secrets, text, bytes, arrays, and nested payloads", () => {
  const html = render([[
    {
      id: 2,
      actor_id: null,
      actor: null,
      action: "account.updated",
      target_type: "accounts.user",
      target_id: 8,
      metadata: {
        is_active: false,
        value: "RawPassword123!",
        credential: "still-secret",
        bytes_value: "encoded-secret",
        payload: ["array-secret", 1],
        nested: { value: "nested-secret" },
      },
      created_at: "2026-07-27T08:00:00Z",
    },
  ], "", false]);

  expect(html).toContain('&quot;is_active&quot;:false');
  expect(html).not.toMatch(/RawPassword|still-secret|encoded-secret|array-secret|nested-secret|credential|payload|nested/);
});
