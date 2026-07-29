import { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const harness = vi.hoisted(() => ({
  api: vi.fn(),
  apiResponse: vi.fn(),
  effects: [] as Array<() => void | (() => void)>,
  index: 0,
  setters: [] as ReturnType<typeof vi.fn>[],
  states: [] as unknown[],
}));

vi.mock("../api", () => ({ api: harness.api, apiResponse: harness.apiResponse }));
vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
    useRef: () => ({ current: { close: vi.fn(), showModal: vi.fn() } }),
    useId: () => "test-id",
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
const emptyDraft = { full_name: "", email: "", role: "TEACHER", password: "", phone: "", date_of_birth: "", gender: "", address: "" };

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

function findByType(node: ReactNode, type: string): ReactElement | undefined {
  if (!node || typeof node !== "object") return undefined;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === type) return element;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findByType(child, type);
    if (found) return found;
  }
  return undefined;
}

function findButton(node: ReactNode, text: string): ReactElement | undefined {
  if (!node || typeof node !== "object") return undefined;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === "button" && element.props.children === text) return element;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findButton(child, text);
    if (found) return found;
  }
  return undefined;
}

beforeEach(() => {
  harness.api.mockReset();
  harness.apiResponse.mockReset();
  vi.useRealTimers();
  vi.stubGlobal("confirm", vi.fn());
});

test("search waits 300 ms and sends only the supported role filter", async () => {
  vi.useFakeTimers();
  harness.api.mockResolvedValue([]);
  render([[], "", true, "ada@example.test", "STUDENT"]);

  expect(harness.effects.length).toBeGreaterThanOrEqual(1);
  harness.effects[0]();
  expect(harness.api).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(299);
  expect(harness.api).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(harness.api).toHaveBeenCalledWith("/users?q=ada%40example.test&role=STUDENT");
});

test("role tabs retain the search query when selecting Students", () => {
  const { tree } = render([[], "", true, "ada@example.test", ""]);
  const tab = findButton(tree, "Học sinh");

  expect(tab).toBeDefined();
  (tab!.props as { onClick: () => void }).onClick();
  expect(harness.setters[4]).toHaveBeenCalledWith("STUDENT");
});

test("renders Vietnamese role tabs and shared account and deactivation dialogs", () => {
  const { html } = render([[], "", false, "", "", null]);

  expect(html).toContain("<dialog");
  expect(html.match(/<dialog/g)).toHaveLength(2);
  expect(html).toContain('aria-label="Search accounts"');
  expect(html).toContain(">Tất cả<");
  expect(html).toContain(">Giáo viên<");
  expect(html).toContain(">Học sinh<");
  expect(html).toContain('role="tablist"');
});

test("a blank account name displays the email local-part", () => {
  const { html } = render([[{ ...user, full_name: "  ", email: "ada.teacher@example.test" }], "", false]);

  expect(html).toContain('<ul class="list-group');
  expect(html).toContain(">ada.teacher</h2>");
  expect(html).not.toContain("Unnamed account");
});

test("edit mode makes email and role immutable without offering a password reset", () => {
  const draft = { full_name: user.full_name, email: user.email, role: user.role, password: "", phone: user.phone, date_of_birth: user.date_of_birth, gender: user.gender, address: user.address };
  const { html } = render([[user], "", false, "", "", user, draft]);

  expect(html).toMatch(/<input readOnly=""[^>]+value="ada@example\.test"/);
  expect(html).toContain('name="role" disabled=""');
  expect(html).not.toContain("New password");
  expect(html).not.toContain('name="new_password"');
  expect(html).not.toContain('name="password" required=""');
});

test("a submitted dialog keeps its values and field feedback after a 422", async () => {
  const draft = { full_name: "Retained Name", email: "taken@example.test", role: "TEACHER", password: "password1", phone: "", date_of_birth: "", gender: "", address: "" };
  const failure = { status: 422, detail: "Request failed.", fields: { email: ["Already registered."] } };
  harness.api.mockRejectedValueOnce(failure);
  const { tree } = render([[], "", false, "", "", null, draft, null, false, true, null, false]);
  const form = findByType(tree, "form");

  expect(form).toBeDefined();
  await (form!.props as { onSubmit: (event: { preventDefault: () => void }) => Promise<void> }).onSubmit({ preventDefault: vi.fn() });
  expect(harness.api).toHaveBeenCalledWith("/users", expect.objectContaining({ method: "POST" }));
  expect(harness.setters[6]).not.toHaveBeenCalled();
  expect(harness.setters[9]).not.toHaveBeenCalled();
  expect(harness.setters[7]).toHaveBeenLastCalledWith(failure);

  const { html } = render([[], "", false, "", "", null, draft, failure, false, true, null, false]);
  expect(html).toContain('value="Retained Name"');
  expect(html).toContain('value="taken@example.test"');
  expect(html).toContain("Already registered.");
  expect(html).toContain("Create account");
});

test("deactivation confirmation retains the card after a non-204 success response", async () => {
  harness.apiResponse.mockResolvedValueOnce({ status: 200, data: undefined });
  const { tree } = render([[user], "", false, "", "", "", emptyDraft, null, false, false, user, false]);
  const button = findButton(tree, "Vô hiệu hóa");

  expect(button).toBeDefined();
  (button!.props as { onClick: () => void }).onClick();
  expect(harness.apiResponse).toHaveBeenCalledWith("/users/7", { method: "DELETE" });
  await Promise.resolve();
  await Promise.resolve();
  expect(harness.setters[0]).not.toHaveBeenCalled();
});

test("deactivation confirmation removes the card only after an exact 204 response", async () => {
  harness.apiResponse.mockResolvedValueOnce({ status: 204, data: undefined });
  const { tree } = render([[user], "", false, "", "", "", emptyDraft, null, false, false, user, false]);
  const button = findButton(tree, "Vô hiệu hóa");

  (button!.props as { onClick: () => void }).onClick();
  await Promise.resolve();
  await Promise.resolve();
  expect(harness.setters[0]).toHaveBeenCalledOnce();
  expect(harness.setters[0].mock.calls[0][0]([user])).toEqual([]);
});

test("a rejected deactivation retains the active row", async () => {
  harness.apiResponse.mockRejectedValueOnce({ status: 422, detail: "Account is assigned to an active Class." });
  const { tree } = render([[user], "", false, "", "", "", emptyDraft, null, false, false, user, false]);
  const button = findButton(tree, "Vô hiệu hóa");

  expect(button).toBeDefined();
  (button!.props as { onClick: () => void }).onClick();
  await Promise.resolve();
  await Promise.resolve();

  expect(harness.setters[0]).not.toHaveBeenCalled();
  expect(harness.setters[1]).toHaveBeenCalledWith("Account is assigned to an active Class.");
});
