import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";

const json = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });

/** Các test ở đây nói về shell và điều hướng, không về dashboard. `/api/dashboard`
 * vì thế được trả một payload rỗng đúng hình theo role, đủ để `DashboardPage`
 * render mà không kéo theo dữ liệu giả nào phải bảo trì. */
const EMPTY_DASHBOARD: Record<string, unknown> = {
  ADMIN: {
    role: "ADMIN",
    accounts: { admins: 0, teachers: 0, students: 0 },
    classes: { running: 0, scheduled: 0, ended: 0, disabled: 0 },
    recent_audit: [],
  },
  TEACHER: {
    role: "TEACHER",
    cards: { my_classes: 0, running_classes: 0, open_assignments: 0, pending_grading: 0, students: 0 },
    pending: [],
    due_soon: [],
  },
  STUDENT: {
    role: "STUDENT",
    cards: { my_classes: 0, not_submitted: 0, graded: 0, average_score: null },
    todo: [],
    recent_grades: [],
  },
};

/** Chỉ hai endpoint được trả dữ liệu thật: phiên đăng nhập và dashboard. Mọi
 * lời gọi khác trả 500 để trang đích hiện trạng thái lỗi của nó thay vì nhận
 * một payload sai hình — các test này không nói gì về những trang đó. */
const stubFetch = (me: { role: string; [key: string]: unknown }) =>
  vi.fn(async (url: string) => {
    const path = String(url);
    if (path.startsWith("/api/dashboard")) return json(EMPTY_DASHBOARD[me.role]);
    if (path.startsWith("/api/auth/me")) return json(me);
    return new Response(null, { status: 500 });
  });

describe("App", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("clears a 401 session and sends the visitor to login", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "stale-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(sessionStorage.getItem("access_token")).toBeNull();
  });

  it("sends an anonymous visitor from a protected route to login", async () => {
    window.history.replaceState({}, "", "/dashboard");
    vi.stubGlobal("fetch", vi.fn());

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  it("sends a user without the required role to the dashboard", async () => {
    window.history.replaceState({}, "", "/admin/users");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", stubFetch({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Tổng quan" })).toBeTruthy();
  });

  it.each([
    ["ADMIN", ["Dashboard", "Accounts", "Classes", "Audit"]],
    ["TEACHER", ["Dashboard", "My Classes"]],
    ["STUDENT", ["Dashboard", "My Classes"]],
  ] as const)("shows the %s navigation", async (role, links) => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("fetch", stubFetch({
      id: 1, full_name: "Ada", email: "ada@example.test", role, phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }));

    render(<App />);

    await screen.findByRole("heading", { name: "Tổng quan" });
    for (const link of links) expect(screen.getByRole("link", { name: link })).toBeTruthy();
  });

  it("shows the notification bell in the shell header for a student and drops the /notifications link", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal("fetch", stubFetch({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "STUDENT", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }));

    render(<App />);

    await screen.findByRole("heading", { name: "Tổng quan" });
    expect(screen.getByRole("button", { name: /Thông báo/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Notifications" })).toBeNull();
  });

  it("hides the bell for an admin", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal("fetch", stubFetch({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "ADMIN", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }));

    render(<App />);

    await screen.findByRole("heading", { name: "Tổng quan" });
    expect(screen.queryByRole("button", { name: /Thông báo/ })).toBeNull();
  });

  it("allows a forced user only on change password", async () => {
    window.history.replaceState({}, "", "/profile");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", stubFetch({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: true,
    }));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Change password" })).toBeTruthy();
  });

  it("allows a forced user to open change password directly", async () => {
    window.history.replaceState({}, "", "/change-password");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", stubFetch({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: true,
    }));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Change password" })).toBeTruthy();
  });

  it.each(["/login", "/forgot-password", "/reset-password"])(
    "sends a forced user from public route %s to change password",
    async (path) => {
      window.history.replaceState({}, "", path);
      sessionStorage.setItem("access_token", "token");
      vi.stubGlobal("fetch", stubFetch({
        id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
        date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: true,
      }));

      render(<App />);

      expect(await screen.findByRole("heading", { name: "Change password" })).toBeTruthy();
    },
  );

  it("sends the retired gradebook route to the class page gradebook tab", async () => {
    window.history.replaceState({}, "", "/teacher/classes/9/gradebook");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", stubFetch({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }));

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/teacher/classes/9"));
    expect(window.location.search).toBe("?tab=gradebook");
  });

  it("routes /admin/classes to the AdminClassesPage instead of the placeholder", async () => {
    window.history.replaceState({}, "", "/admin/classes");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 1, full_name: "Admin", email: "admin@example.test", role: "ADMIN", phone: null,
        date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
      }), { headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), {
        headers: { "Content-Type": "application/json" },
      })));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Classes" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create Class" })).toBeTruthy();
  });

  it("names the password visibility control", async () => {
    window.history.replaceState({}, "", "/login");
    vi.stubGlobal("fetch", vi.fn());

    render(<App />);

    expect(await screen.findByRole("button", { name: "Show password" })).toBeTruthy();
  });

  it("names the drawer controls", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", stubFetch({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }));
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Tổng quan" });
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("button", { name: "Close menu" })).toBeTruthy();
  });

  it("moves focus into the opened drawer", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", stubFetch({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }));
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Tổng quan" });
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("button", { name: "Close navigation" })).toBe(document.activeElement);
  });

  it("keeps the closed mobile drawer out of the tab order", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", stubFetch({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }));

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "Tổng quan" });
    const drawer = document.querySelector<HTMLElement>('aside[aria-label="Main navigation"]')!;
    expect(drawer.getAttribute("aria-hidden")).toBe("true");
    expect(drawer.hasAttribute("inert")).toBe(true);
    for (let index = 0; index < 5; index += 1) {
      await user.tab();
      expect(drawer.contains(document.activeElement)).toBe(false);
    }
  });

  it("keeps the desktop sidebar controls in the tab order", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("fetch", stubFetch({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }));

    render(<App />);

    await screen.findByRole("heading", { name: "Tổng quan" });
    const drawer = screen.getByRole("complementary", { name: "Main navigation" });
    expect(drawer.getAttribute("aria-hidden")).toBe("false");
    expect(drawer.hasAttribute("inert")).toBe(false);
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("tabindex")).toBeNull();
  });

  it("keeps focus on a selected desktop sidebar link", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("fetch", stubFetch({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }));
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Tổng quan" });
    const navLink = screen.getByRole("link", { name: "My Classes" });
    await user.click(navLink);
    expect(navLink).toBe(document.activeElement);
  });

  it("returns focus to the menu opener after Escape closes the drawer", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", stubFetch({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }));
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Tổng quan" });
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(document.body.style.overflow).toBe("");
      expect(document.querySelector('aside[aria-label="Main navigation"]')?.getAttribute("aria-hidden")).toBe("true");
      expect(screen.getByRole("button", { name: "Open menu" })).toBe(document.activeElement);
    });
  });

  it("returns focus to the menu opener after the backdrop closes the drawer", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", stubFetch({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }));
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Tổng quan" });
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("button", { name: "Close menu" }));
    await waitFor(() => {
      expect(document.body.style.overflow).toBe("");
      expect(document.querySelector('aside[aria-label="Main navigation"]')?.getAttribute("aria-hidden")).toBe("true");
      expect(screen.getByRole("button", { name: "Open menu" })).toBe(document.activeElement);
    });
  });

  it("closes the drawer when a navigation link is selected", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", stubFetch({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }));
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Tổng quan" });
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("link", { name: "My Classes" }));
    await waitFor(() => expect(document.querySelector('aside[aria-label="Main navigation"]')?.getAttribute("aria-hidden")).toBe("true"));
  });

  it("cleans up the body scroll lock when the shell unmounts", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", stubFetch({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }));
    const user = userEvent.setup();
    const view = render(<App />);

    await screen.findByRole("heading", { name: "Tổng quan" });
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(document.body.style.overflow).toBe("hidden");
    view.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("moves focus to the main content when the skip link is activated", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", stubFetch({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }));

    render(<App />);

    await screen.findByRole("heading", { name: "Tổng quan" });
    await userEvent.setup().click(screen.getByRole("link", { name: "Skip to main content" }));
    expect(document.getElementById("main-content")).toBe(document.activeElement);
    expect(document.getElementById("main-content")?.getAttribute("tabindex")).toBe("-1");
  });
});
