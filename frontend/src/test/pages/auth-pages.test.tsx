import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../App";

const user = {
  id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
  date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: true,
};

describe("authentication pages", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("routes a forced login to change password", async () => {
    window.history.replaceState({}, "", "/login");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token", user }), { headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(user), { headers: { "Content-Type": "application/json" } })));
    render(<App />);
    const events = userEvent.setup();
    await events.type(await screen.findByLabelText("Email"), "ada@example.test");
    await events.type(screen.getByLabelText("Password"), "temporary");
    await events.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Change password" })).toBeTruthy();
  });

  it("always shows the generic forgot password notice", async () => {
    window.history.replaceState({}, "", "/forgot-password");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    render(<App />);
    const events = userEvent.setup();
    await events.type(await screen.findByLabelText("Email"), "nobody@example.test");
    await events.click(screen.getByRole("button", { name: "Send reset link" }));
    expect((await screen.findByRole("alert")).textContent).toContain("If an account exists for that email, we sent a reset link.");
  });

  it.each(["", "?token=missing", "?token=expired"])("offers recovery when reset preflight cannot be used (%s)", async (query) => {
    window.history.replaceState({}, "", `/reset-password${query}`);
    const status = query.includes("expired") ? 410 : 404;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    render(<App />);
    expect((await screen.findByRole("link", { name: "Request a new reset link" })).getAttribute("href")).toBe("/forgot-password");
  });

  it("keeps reset drafts and shows mismatch and server validation inline", async () => {
    window.history.replaceState({}, "", "/reset-password?token=valid");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ new_password: ["Too common."] }), { status: 422, headers: { "Content-Type": "application/json" } })));
    render(<App />);
    const events = userEvent.setup();
    await events.type(await screen.findByLabelText("New password"), "new-password");
    await events.type(screen.getByLabelText("Confirm new password"), "different");
    await events.click(screen.getByRole("button", { name: "Reset password" }));
    expect(screen.getByRole("alert").textContent).toContain("Passwords do not match.");
    await events.clear(screen.getByLabelText(/^Confirm new password/));
    await events.type(screen.getByLabelText(/^Confirm new password/), "new-password");
    await events.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByText("Too common.")).toBeTruthy();
    expect((screen.getByLabelText(/^New password/) as HTMLInputElement).value).toBe("new-password");
  });

  it("returns to login with a reset success notice", async () => {
    window.history.replaceState({}, "", "/reset-password?token=valid");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 })));
    render(<App />);
    const events = userEvent.setup();
    await events.type(await screen.findByLabelText("New password"), "new-password");
    await events.type(screen.getByLabelText("Confirm new password"), "new-password");
    await events.click(screen.getByRole("button", { name: "Reset password" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Your password has been reset. Sign in with your new password.");
  });

  it("uses noValidate and accessible inline validation without title or tooltip", async () => {
    window.history.replaceState({}, "", "/login");
    vi.stubGlobal("fetch", vi.fn());
    render(<App />);
    const form = await screen.findByRole("button", { name: "Sign in" }).then((button) => button.closest("form")!);
    await userEvent.setup().click(screen.getByRole("button", { name: "Sign in" }));
    expect(form.hasAttribute("novalidate")).toBe(true);
    expect(screen.getByText("Email is required.").textContent).toContain("Email is required.");
    expect(form.querySelector("[title]")).toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("uses credential autocomplete semantics", async () => {
    window.history.replaceState({}, "", "/login");
    vi.stubGlobal("fetch", vi.fn());
    const { unmount } = render(<App />);
    expect((await screen.findByLabelText("Email")).getAttribute("autocomplete")).toBe("email");
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("current-password");
    unmount();

    window.history.replaceState({}, "", "/reset-password?token=valid");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const reset = render(<App />);
    expect((await screen.findByLabelText("New password")).getAttribute("autocomplete")).toBe("new-password");
    expect(screen.getByLabelText("Confirm new password").getAttribute("autocomplete")).toBe("new-password");
    reset.unmount();

    window.history.replaceState({}, "", "/change-password");
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(user), { headers: { "Content-Type": "application/json" } })));
    render(<App />);
    expect((await screen.findByLabelText("Current password")).getAttribute("autocomplete")).toBe("current-password");
    expect(screen.getByLabelText("New password").getAttribute("autocomplete")).toBe("new-password");
    expect(screen.getByLabelText("Confirm new password").getAttribute("autocomplete")).toBe("new-password");
  });
});
