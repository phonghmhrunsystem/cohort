import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

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
