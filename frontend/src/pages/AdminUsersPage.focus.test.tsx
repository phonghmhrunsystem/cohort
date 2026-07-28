// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const harness = vi.hoisted(() => ({ api: vi.fn(), apiResponse: vi.fn() }));
vi.mock("../api", () => ({ ...harness }));

import { AdminUsersPage } from "./AdminUsersPage";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.assign(HTMLDialogElement.prototype, {
    close(this: HTMLDialogElement) { this.open = false; },
    showModal(this: HTMLDialogElement) { this.open = true; },
  });
  harness.api.mockResolvedValue([{
    id: 7, full_name: "Ada Teacher", email: "ada@example.test", role: "TEACHER",
    phone: null, date_of_birth: null, gender: null, address: null, is_active: true,
  }]);
  harness.apiResponse.mockResolvedValue({ status: 204, data: undefined });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(<AdminUsersPage />); });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("successful deactivation focuses the stable accounts heading after removing its opener", async () => {
  const opener = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Deactivate")!;
  opener.focus();
  await act(async () => { opener.click(); });
  const confirm = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Vô hiệu hóa")!;

  await act(async () => { confirm.click(); });

  expect(document.activeElement?.textContent).toBe("Accounts");
});
