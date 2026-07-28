// @vitest-environment jsdom
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { AppShell } from "../AppShell";
import { displayName, User } from "../auth";
import { AppDialog } from "./AppDialog";

const user = (role: User["role"], full_name: string | null): User => ({
  id: 1,
  full_name,
  email: "nguyen.an@example.test",
  role,
  phone: null,
  date_of_birth: null,
  gender: null,
  address: null,
  is_active: true,
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.assign(HTMLDialogElement.prototype, {
    close(this: HTMLDialogElement) { this.open = false; },
    showModal(this: HTMLDialogElement) { this.open = true; },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function renderDialog(open: boolean, pending: boolean, onClose: () => void) {
  act(() => root.render(<AppDialog open={open} title="Gỡ Nguyễn An" pending={pending} onClose={onClose}><p>Sure?</p></AppDialog>));
  return document.querySelector("dialog")!;
}

test("displayName prefers a non-blank full name and otherwise uses the email local-part", () => {
  expect(displayName({ full_name: "  Nguyễn An  ", email: "fallback@example.test" })).toBe("Nguyễn An");
  expect(displayName({ full_name: "  ", email: "nguyen.an@example.test" })).toBe("nguyen.an");
});

test.each([
  ["ADMIN", "Quản trị viên"],
  ["TEACHER", "Giáo viên"],
  ["STUDENT", "Học sinh"],
] as const)("the %s shell greets the signed-in user with the Vietnamese role", (role, label) => {
  vi.stubGlobal("location", { pathname: "" });
  const html = renderToStaticMarkup(<AppShell user={user(role, null)}>Page</AppShell>);

  expect(html).toContain("Chào, nguyen.an");
  expect(html).toContain(label);
});

test("a pending dialog keeps every supplied close control unavailable", () => {
  const html = renderToStaticMarkup(<AppDialog open title="Gỡ Nguyễn An" pending onClose={vi.fn()}><p>Sure?</p></AppDialog>);

  expect(html).toContain("Gỡ Nguyễn An");
  expect(html).toMatch(/aria-label="Đóng"[^>]*disabled=""/);
  expect(html).toMatch(/disabled="">Cancel<\/button>/);
});

test("simultaneous dialogs each label themselves with their own title", () => {
  const html = renderToStaticMarkup(<><AppDialog open title="Gỡ Nguyễn An" onClose={vi.fn()}><p>Remove?</p></AppDialog><AppDialog open title="Xóa Code" onClose={vi.fn()}><p>Delete?</p></AppDialog></>);
  const ids = Array.from(html.matchAll(/aria-labelledby="([^"]+)"/g), ([, id]) => id);

  expect(new Set(ids).size).toBe(2);
  ids.forEach((id) => expect(html).toContain(`id="${id}"`));
});

test("a pending dialog ignores Cancel, Escape, and overlay close attempts", () => {
  const onClose = vi.fn();
  const dialog = renderDialog(true, true, onClose);
  const cancel = Array.from(dialog.querySelectorAll("button")).find((button) => button.textContent === "Cancel")!;
  const escape = new Event("cancel", { bubbles: true, cancelable: true });

  act(() => cancel.click());
  act(() => dialog.dispatchEvent(escape));
  act(() => dialog.dispatchEvent(new MouseEvent("click", { bubbles: true })));

  expect(cancel.disabled).toBe(true);
  expect(escape.defaultPrevented).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
});

test("an ordinary close restores focus to the opener", () => {
  const onClose = vi.fn();
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  const dialog = renderDialog(true, false, onClose);
  const cancel = Array.from(dialog.querySelectorAll("button")).find((button) => button.textContent === "Cancel")!;

  act(() => cancel.click());
  renderDialog(false, false, onClose);

  expect(onClose).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(opener);
  opener.remove();
});

test("a close restores focus to the supplied fallback when success removed the opener", () => {
  const fallback = document.createElement("button");
  const opener = document.createElement("button");
  document.body.append(fallback, opener);
  opener.focus();
  const fallbackFocus = { current: fallback };

  act(() => root.render(<AppDialog open title="Remove account" fallbackFocus={fallbackFocus} onClose={vi.fn()}><p>Sure?</p></AppDialog>));
  opener.remove();
  act(() => root.render(<AppDialog open={false} title="Remove account" fallbackFocus={fallbackFocus} onClose={vi.fn()}><p>Sure?</p></AppDialog>));

  expect(document.activeElement).toBe(fallback);
  fallback.remove();
});
