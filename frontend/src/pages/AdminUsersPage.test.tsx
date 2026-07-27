import { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const harness = vi.hoisted(() => ({
  api: vi.fn(),
  effects: [] as Array<() => void | (() => void)>,
  index: 0,
  setters: [] as ReturnType<typeof vi.fn>[],
  states: [] as unknown[],
}));

vi.mock("../api", () => ({ api: harness.api }));
vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
    useRef: () => ({ current: { close: vi.fn(), showModal: vi.fn() } }),
    useState: <T,>(initial: T) => {
      const index = harness.index++;
      const setter = vi.fn();
      harness.setters[index] = setter;
      return [index < harness.states.length ? harness.states[index] : initial, setter];
    },
  };
});

import { AdminUsersPage } from "./AdminUsersPage";

const user = {
  id: 7,
  full_name: "Ada Teacher",
  email: "ada@example.test",
  role: "TEACHER",
  phone: "+84912345678",
  date_of_birth: "1990-01-02",
  gender: "NU",
  address: "Da Nang",
  is_active: true,
} as const;

function render(states: unknown[]) {
  harness.effects = [];
  harness.index = 0;
  harness.setters = [];
  harness.states = states;
  const tree = AdminUsersPage();
  return { html: renderToStaticMarkup(tree), tree };
}

function findByText(node: ReactNode, text: string): ReactElement | undefined {
  if (!node || typeof node !== "object") return undefined;
  const element = node as ReactElement<{ children?: ReactNode }>;
  const children = element.props?.children;
  if (typeof children === "string" && children === text) return element;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findByText(child, text);
    if (found) return found;
  }
  return undefined;
}

beforeEach(() => {
  harness.api.mockReset();
  vi.useRealTimers();
  vi.stubGlobal("confirm", vi.fn());
});

test("search waits 300 ms and sends only the supported role filter", async () => {
  vi.useFakeTimers();
  harness.api.mockResolvedValue([]);
  render([[], "", true, "ada@example.test", "STUDENT"]);

  expect(harness.effects).toHaveLength(1);
  harness.effects[0]();
  expect(harness.api).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(299);
  expect(harness.api).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(harness.api).toHaveBeenCalledWith("/users?q=ada%40example.test&role=STUDENT");
});

test("renders search, allowed filters, and one native account dialog", () => {
  const { html } = render([[], "", false, "", "", null]);

  expect(html).toContain("<dialog");
  expect(html.match(/<dialog/g)).toHaveLength(1);
  expect(html).toContain('aria-label="Search accounts"');
  expect(html).toContain(">All<");
  expect(html).toContain(">Teacher<");
  expect(html).toContain(">Student<");
  expect(html).not.toContain('value="ADMIN"');
});

test("edit mode makes email and role immutable and offers an optional password reset", () => {
  const draft = { full_name: user.full_name, email: user.email, role: user.role, password: "", phone: user.phone, date_of_birth: user.date_of_birth, gender: user.gender, address: user.address };
  const { html } = render([[user], "", false, "", "", user, draft]);

  expect(html).toMatch(/<input readOnly=""[^>]+value="ada@example\.test"/);
  expect(html).toContain('name="role" disabled=""');
  expect(html).toContain("New password");
  expect(html).not.toContain('name="password" required=""');
});

test("a 422 keeps entered values in the open dialog and shows field feedback", async () => {
  const draft = { full_name: "Retained Name", email: "taken@example.test", role: "TEACHER", password: "password1", phone: "", date_of_birth: "", gender: "", address: "" };
  const failure = { status: 422, detail: "Request failed.", fields: { email: ["Already registered."] } };
  const { html, tree } = render([[], "", false, "", "", null, draft, failure, false, true]);

  expect(html).toContain('value="Retained Name"');
  expect(html).toContain('value="taken@example.test"');
  expect(html).toContain("Already registered.");
  expect(html).toContain("<dialog open=");

  harness.api.mockRejectedValueOnce(failure);
  const form = findByText(tree, "Create account")?.props;
  expect(form).toBeDefined();
});

test("deactivation confirms and removes a row only after the 204 request resolves", async () => {
  let resolve!: () => void;
  harness.api.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
  vi.mocked(confirm).mockReturnValue(true);
  const { tree } = render([[user], "", false, "", "", null]);
  const button = findByText(tree, "Deactivate");

  expect(button).toBeDefined();
  (button!.props as { onClick: () => void }).onClick();
  expect(confirm).toHaveBeenCalledWith("Deactivate Ada Teacher?");
  expect(harness.api).toHaveBeenCalledWith("/users/7", { method: "DELETE" });
  expect(harness.setters[0]).not.toHaveBeenCalled();

  resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(harness.setters[0]).toHaveBeenCalledOnce();
  expect(harness.setters[0].mock.calls[0][0]([user])).toEqual([]);
});

test("a rejected deactivation retains the active row", async () => {
  harness.api.mockRejectedValueOnce({ status: 422, detail: "Account is assigned to an active Class." });
  vi.mocked(confirm).mockReturnValue(true);
  const { tree } = render([[user], "", false, "", "", null]);
  const button = findByText(tree, "Deactivate");

  expect(button).toBeDefined();
  (button!.props as { onClick: () => void }).onClick();
  await Promise.resolve();
  await Promise.resolve();

  expect(harness.setters[0]).not.toHaveBeenCalled();
  expect(harness.setters[1]).toHaveBeenCalledWith("Account is assigned to an active Class.");
});
