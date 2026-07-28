import { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const harness = vi.hoisted(() => ({ api: vi.fn(), effects: [] as Array<() => void | (() => void)>, index: 0, setters: [] as ReturnType<typeof vi.fn>[], states: [] as unknown[] }));

vi.mock("../api", () => ({ api: harness.api }));
vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
    useState: <T,>(initial: T) => {
      const index = harness.index++;
      const setter = vi.fn();
      harness.setters[index] = setter;
      return [index < harness.states.length ? harness.states[index] : initial, setter];
    },
  };
});

import { ProfilePage } from "./ProfilePage";

const user = { id: 7, full_name: "Nguyen An", email: "an@example.test", role: "STUDENT", phone: "+84912345678", date_of_birth: "2001-02-03", gender: "NAM", address: "Da Nang", is_active: true } as const;
const draft = { full_name: user.full_name, phone: user.phone, date_of_birth: user.date_of_birth, gender: user.gender, address: user.address };

function render(states: unknown[]) {
  harness.index = 0;
  harness.effects = [];
  harness.setters = [];
  harness.states = states;
  return ProfilePage();
}

function findByType(node: ReactNode, type: string): ReactElement | undefined {
  if (!node || typeof node !== "object") return undefined;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === type) return element;
  for (const child of Array.isArray(element.props?.children) ? element.props.children : [element.props?.children]) {
    const found = findByType(child, type);
    if (found) return found;
  }
  return undefined;
}

function findButton(node: ReactNode, text: string): ReactElement | undefined {
  if (!node || typeof node !== "object") return undefined;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === "button" && element.props.children === text) return element;
  for (const child of Array.isArray(element.props?.children) ? element.props.children : [element.props?.children]) {
    const found = findButton(child, text);
    if (found) return found;
  }
  return undefined;
}

beforeEach(() => harness.api.mockReset());

test("opening the profile reloads the persisted self profile", async () => {
  harness.api.mockResolvedValueOnce(user);
  render([undefined, undefined, "", {}, false, { current_password: "", new_password: "" }, {}, false]);

  harness.effects[0]();
  await Promise.resolve();

  expect(harness.api).toHaveBeenCalledWith("/auth/me");
  expect(harness.setters[0]).toHaveBeenCalledWith(user);
  expect(harness.setters[1]).toHaveBeenCalledWith(draft);
});

test("saving a profile keeps the returned persisted profile in the form", async () => {
  const saved = { ...user, full_name: "Nguyen An Updated" };
  harness.api.mockResolvedValueOnce(saved);
  const form = findByType(render([user, draft, "", {}, false, { current_password: "", new_password: "" }, "", {}, false]), "form");

  await (form!.props as { onSubmit: (event: { preventDefault: () => void }) => Promise<void> }).onSubmit({ preventDefault: vi.fn() });

  expect(harness.api).toHaveBeenCalledWith("/auth/me", expect.objectContaining({ method: "PATCH" }));
  expect(harness.setters[0]).toHaveBeenCalledWith(saved);
  expect(harness.setters[1]).toHaveBeenCalledWith({ ...draft, full_name: "Nguyen An Updated" });
});

test("profile validation feedback remains visible beside the rejected field", () => {
  const html = renderToStaticMarkup(render([user, draft, "", { phone: ["Use 9 to 15 digits."] }, false, { current_password: "", new_password: "" }, "", {}, false]));

  expect(html).toContain("Use 9 to 15 digits.");
  expect(html).toContain('name="phone"');
});

test("the password dialog posts current and replacement passwords and shows its 422", async () => {
  const failure = { status: 422, detail: "Request failed.", fields: { current_password: ["Current password is incorrect."] } };
  harness.api.mockRejectedValueOnce(failure);
  const tree = render([user, draft, "", {}, true, { current_password: "wrong", new_password: "new-password" }, "", {}, false]);
  const forms: ReactElement[] = [];
  const collect = (node: ReactNode): void => {
    if (!node || typeof node !== "object") return;
    const element = node as ReactElement<{ children?: ReactNode }>;
    if (element.type === "form") forms.push(element);
    (Array.isArray(element.props?.children) ? element.props.children : [element.props?.children]).forEach(collect);
  };
  collect(tree);

  await (forms[1].props as { onSubmit: (event: { preventDefault: () => void }) => Promise<void> }).onSubmit({ preventDefault: vi.fn() });
  expect(harness.api).toHaveBeenCalledWith("/auth/change-password", expect.objectContaining({ method: "POST", body: JSON.stringify({ current_password: "wrong", new_password: "new-password" }) }));
  expect(harness.setters[6]).toHaveBeenCalledWith(failure.fields);

  const html = renderToStaticMarkup(render([user, draft, "", {}, true, { current_password: "wrong", new_password: "new-password" }, failure.fields, false]));
  expect(html).toContain("Current password is incorrect.");
  expect(findButton(tree, "Change password")).toBeDefined();
});
