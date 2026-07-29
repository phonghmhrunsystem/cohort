import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

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
});
