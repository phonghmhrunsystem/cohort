import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../App";

const profile = {
  id: 4, full_name: "Lan Student", email: "lan@example.test", role: "STUDENT",
  phone: "0901234567", date_of_birth: "2000-02-03", gender: "NU",
  hometown: "Hue", address: "Phu Hoi", is_active: true, must_change_password: false,
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json" },
});

function openProfile(path: string, fetchMock: ReturnType<typeof vi.fn>) {
  window.history.replaceState({}, "", path);
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);
}

describe("Profile", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("separates immutable identity from editable profile information", async () => {
    openProfile("/profile", vi.fn().mockResolvedValue(json(profile)));

    expect(await screen.findByRole("heading", { name: "Profile" })).toBeTruthy();
    expect(screen.getByText("lan@example.test")).toBeTruthy();
    expect(screen.getByText("Student")).toBeTruthy();
    expect(screen.getAllByText("Lan Student").length).toBeGreaterThan(0);
    expect(screen.getByText("0901234567")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit profile" }).getAttribute("href")).toBe("/profile/edit");
    expect(screen.getByRole("link", { name: "Change password" }).getAttribute("href")).toBe("/change-password");
  });

  it("omits immutable fields from edit and PATCHes profile-only data", async () => {
    const updated = { ...profile, full_name: "Lan Nguyen" };
    // Định tuyến theo URL: chuông trong shell tự gọi unread-count nên xếp phản
    // hồi theo thứ tự sẽ trả nhầm dữ liệu cho /auth/me (07 §2.2).
    let saved = false;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/notifications/unread-count") return Promise.resolve(json({ unread_count: 0 }));
      if (init?.method === "PATCH") { saved = true; return Promise.resolve(json(updated)); }
      return Promise.resolve(json(saved ? updated : profile));
    });
    openProfile("/profile/edit", fetchMock);
    const events = userEvent.setup();

    const fullName = await screen.findByLabelText("Full name");
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByLabelText("Role")).toBeNull();
    await events.clear(fullName);
    await events.type(fullName, "Lan Nguyen");
    await events.click(screen.getByRole("button", { name: "Save changes" }));

    // Đếm theo URL chứ không theo số lần gọi: chuông thông báo trong shell tự
    // poll unread-count nên tổng số request không cố định (07 §2.2).
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => call[1]?.method === "PATCH")).toBe(true));
    const request = fetchMock.mock.calls.find((call) => call[1]?.method === "PATCH")!;
    expect(request[0]).toBe("/api/auth/me");
    const body = JSON.parse(String(request[1]?.body));
    expect(body.full_name).toBe("Lan Nguyen");
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("role");
    expect(await screen.findByRole("heading", { name: "Profile" })).toBeTruthy();
  });

  it("keeps profile drafts and shows field errors after a 422", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(profile))
      .mockResolvedValueOnce(json({ full_name: ["Use 2 to 100 characters."] }, 422));
    openProfile("/profile/edit", fetchMock);
    const events = userEvent.setup();

    const fullName = await screen.findByLabelText("Full name");
    await events.clear(fullName);
    await events.type(fullName, "X");
    await events.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Use 2 to 100 characters.")).toBeTruthy();
    expect((screen.getByLabelText(/^Full name/) as HTMLInputElement).value).toBe("X");
  });
});
