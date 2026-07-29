import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";

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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }), { headers: { "Content-Type": "application/json" } })));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
  });

  it.each([
    ["ADMIN", ["Dashboard", "Accounts", "Classes", "Audit"]],
    ["TEACHER", ["Dashboard", "My Classes", "Profile", "Notifications"]],
    ["STUDENT", ["Dashboard", "My Classes", "Profile", "Notifications"]],
  ] as const)("shows the %s navigation", async (role, links) => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1, full_name: "Ada", email: "ada@example.test", role, phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }), { headers: { "Content-Type": "application/json" } })));

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
    for (const link of links) expect(screen.getByRole("link", { name: link })).toBeTruthy();
  });

  it("allows a forced user only on change password", async () => {
    window.history.replaceState({}, "", "/profile");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: true,
    }), { headers: { "Content-Type": "application/json" } })));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Change password" })).toBeTruthy();
  });

  it("allows a forced user to open change password directly", async () => {
    window.history.replaceState({}, "", "/change-password");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: true,
    }), { headers: { "Content-Type": "application/json" } })));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Change password" })).toBeTruthy();
  });

  it.each(["/login", "/forgot-password", "/reset-password"])(
    "sends a forced user from public route %s to change password",
    async (path) => {
      window.history.replaceState({}, "", path);
      sessionStorage.setItem("access_token", "token");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
        id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
        date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: true,
      }), { headers: { "Content-Type": "application/json" } })));

      render(<App />);

      expect(await screen.findByRole("heading", { name: "Change password" })).toBeTruthy();
    },
  );

  it("names the password visibility control", async () => {
    window.history.replaceState({}, "", "/login");
    vi.stubGlobal("fetch", vi.fn());

    render(<App />);

    expect(await screen.findByRole("button", { name: "Show password" })).toBeTruthy();
  });

  it("names the drawer controls", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }), { headers: { "Content-Type": "application/json" } })));
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("button", { name: "Close menu" })).toBeTruthy();
  });

  it("moves focus into the opened drawer", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }), { headers: { "Content-Type": "application/json" } })));
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("button", { name: "Close navigation" })).toBe(document.activeElement);
  });

  it("keeps the closed mobile drawer out of the tab order", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }), { headers: { "Content-Type": "application/json" } })));

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }), { headers: { "Content-Type": "application/json" } })));

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }), { headers: { "Content-Type": "application/json" } })));
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
    const profileLink = screen.getByRole("link", { name: "Profile" });
    await user.click(profileLink);
    expect(profileLink).toBe(document.activeElement);
  });

  it("returns focus to the menu opener after Escape closes the drawer", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }), { headers: { "Content-Type": "application/json" } })));
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }), { headers: { "Content-Type": "application/json" } })));
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }), { headers: { "Content-Type": "application/json" } })));
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("link", { name: "Profile" }));
    await waitFor(() => expect(document.querySelector('aside[aria-label="Main navigation"]')?.getAttribute("aria-hidden")).toBe("true"));
  });

  it("cleans up the body scroll lock when the shell unmounts", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }), { headers: { "Content-Type": "application/json" } })));
    const user = userEvent.setup();
    const view = render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(document.body.style.overflow).toBe("hidden");
    view.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("moves focus to the main content when the skip link is activated", async () => {
    window.history.replaceState({}, "", "/dashboard");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }), { headers: { "Content-Type": "application/json" } })));

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
    await userEvent.setup().click(screen.getByRole("link", { name: "Skip to main content" }));
    expect(document.getElementById("main-content")).toBe(document.activeElement);
    expect(document.getElementById("main-content")?.getAttribute("tabindex")).toBe("-1");
  });
});
