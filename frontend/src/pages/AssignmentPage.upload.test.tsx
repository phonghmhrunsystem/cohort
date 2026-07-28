import { ReactElement, ReactNode } from "react";
import { expect, test, vi } from "vitest";

const harness = vi.hoisted(() => ({ api: vi.fn(), index: 0, setters: [] as ReturnType<typeof vi.fn>[], states: [] as unknown[] }));

vi.mock("../api", () => ({ api: harness.api }));
vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return { ...actual, useEffect: vi.fn(), useState: <T,>(initial: T) => {
    const index = harness.index++;
    const setter = vi.fn();
    harness.setters[index] = setter;
    return [index < harness.states.length ? harness.states[index] as T : initial, setter] as const;
  } };
});

import { AssignmentPage } from "./AssignmentPage";

function findByType(node: ReactNode, type: string): ReactElement | undefined {
  if (!node || typeof node !== "object") return undefined;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === type) return element;
  for (const child of Array.isArray(element.props?.children) ? element.props.children : [element.props?.children]) {
    const found = findByType(child, type);
    if (found) return found;
  }
}

test("successful upload resets the captured form after the async request", async () => {
  const reset = vi.fn();
  let released = false;
  harness.index = 0; harness.setters = [];
  harness.states = [[], new Blob(["file"], { type: "application/pdf" }) as File, "Draft note", "", false];
  harness.api.mockReset();
  harness.api.mockImplementationOnce(() => Promise.resolve({ id: 1 }).then((result) => { released = true; return result; }));
  harness.api.mockResolvedValueOnce([]);
  const form = findByType(AssignmentPage({ assignmentId: 3, role: "STUDENT" }), "form");

  await (form!.props as { onSubmit: (event: { preventDefault: () => void; readonly currentTarget: { reset: () => void } }) => Promise<void> }).onSubmit({
    preventDefault: vi.fn(),
    get currentTarget() {
      if (released) throw new Error("event target released");
      return { reset };
    },
  });

  expect(reset).toHaveBeenCalledOnce();
  expect(harness.api).toHaveBeenNthCalledWith(1, "/assignments/3/submissions", expect.objectContaining({ method: "POST" }));
  expect(harness.api).toHaveBeenNthCalledWith(2, "/assignments/3/submissions");
  expect(harness.setters[3]).toHaveBeenCalledTimes(1);
});
