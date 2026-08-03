import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { App } from "../../App";

const admin = {
  id: 1, full_name: "Admin", email: "admin@example.test", role: "ADMIN",
  phone: null, date_of_birth: null, gender: null, hometown: null, address: null,
  is_active: true, must_change_password: false,
};
const account = {
  id: 2, full_name: "Ada Teacher", email: "ada@example.test", role: "TEACHER",
  phone: "0901234567", date_of_birth: "1990-01-02", gender: "NU",
  hometown: "Da Nang", address: "Hai Chau", is_active: false,
  must_change_password: false, created_at: "2026-01-05T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
};
const page = (results = [account]) => ({ count: results.length, next: null, previous: null, results });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json" },
});

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterAll(() => {
  HTMLDialogElement.prototype.showModal = originalShowModal;
  HTMLDialogElement.prototype.close = originalClose;
});

function openAccounts(fetchMock: ReturnType<typeof vi.fn>) {
  window.history.replaceState({}, "", "/admin/users");
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);
}

describe("Admin accounts", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("fetches only on Search and preserves submitted filters while paging", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(admin))
      .mockResolvedValueOnce(json({ ...page(), count: 11, next: "/api/users?page=2", previous: null }))
      .mockResolvedValueOnce(json({ ...page(), count: 11, next: "/api/users?page=2", previous: null }))
      .mockResolvedValueOnce(json({ ...page(), count: 11, next: null, previous: "/api/users?page=1" }));
    openAccounts(fetchMock);
    const events = userEvent.setup();

    await screen.findByText("ada@example.test");
    await events.type(screen.getByLabelText("Search accounts"), "Ada");
    await events.selectOptions(screen.getByLabelText("Role"), "TEACHER");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await events.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2][0]).toBe("/api/users?q=Ada&role=TEACHER");

    await events.type(screen.getByLabelText("Search accounts"), " changed");
    await events.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock.mock.calls[3][0]).toBe("/api/users?q=Ada&role=TEACHER&page=2");
  });

  it("ignores an older list response that resolves after a submitted search", async () => {
    const searched = { ...account, id: 3, full_name: "Grace Student", email: "grace@example.test", role: "STUDENT" };
    let resolveInitial!: (response: Response) => void;
    let resolveSearch!: (response: Response) => void;
    const initialResponse = new Promise<Response>((resolve) => { resolveInitial = resolve; });
    const searchResponse = new Promise<Response>((resolve) => { resolveSearch = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(admin))
      .mockReturnValueOnce(initialResponse)
      .mockReturnValueOnce(searchResponse);
    openAccounts(fetchMock);
    const events = userEvent.setup();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await events.type(screen.getByLabelText("Search accounts"), "Grace");
    await events.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    resolveSearch(json(page([searched])));
    expect(await screen.findByText("grace@example.test")).toBeTruthy();

    resolveInitial(json(page()));
    await waitFor(() => expect(screen.queryByText("ada@example.test")).toBeNull());
    expect(screen.getByText("grace@example.test")).toBeTruthy();
  });

  it("shows disabled accounts and exposes every row action from an accessible menu", async () => {
    openAccounts(vi.fn().mockResolvedValueOnce(json(admin)).mockResolvedValueOnce(json(page())));
    const events = userEvent.setup();

    await screen.findByText("ada@example.test");
    expect(screen.getByText("Disabled")).toBeTruthy();
    const trigger = screen.getByRole("button", { name: "Actions for ada@example.test" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    await events.click(trigger);
    const menu = screen.getByRole("menu");
    for (const name of ["View", "Change password", "Enable", "Delete"]) {
      expect(menu.querySelector(`[aria-label="${name} ada@example.test"]`)).toBeTruthy();
    }
  });

  it("moves focus through the action menu and returns it on Escape", async () => {
    openAccounts(vi.fn().mockResolvedValueOnce(json(admin)).mockResolvedValueOnce(json(page())));
    const events = userEvent.setup();

    await screen.findByText("ada@example.test");
    const trigger = screen.getByRole("button", { name: "Actions for ada@example.test" });
    await events.click(trigger);
    expect(screen.getByRole("menuitem", { name: "View ada@example.test" })).toBe(document.activeElement);
    await events.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Change password ada@example.test" })).toBe(document.activeElement);
    await events.keyboard("{Escape}");
    expect(trigger).toBe(document.activeElement);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps create-account drafts after a 422 response on its own page", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(admin))
      .mockResolvedValueOnce(json(page()))
      .mockResolvedValueOnce(json({ email: ["Already exists."] }, 422));
    openAccounts(fetchMock);
    const events = userEvent.setup();

    await events.click(await screen.findByRole("link", { name: "Create User" }));
    expect(window.location.pathname).toBe("/admin/users/new");
    await events.type(screen.getByLabelText("Full name"), "New Teacher");
    await events.type(screen.getByLabelText("Email"), "used@example.test");
    await events.type(screen.getByLabelText("Initial password"), "Temporary123!");
    await events.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Already exists.")).toBeTruthy();
    expect((screen.getByLabelText(/^Email/) as HTMLInputElement).value).toBe("used@example.test");
    expect(window.location.pathname).toBe("/admin/users/new");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("returns to the accounts list after creating an account", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(admin))
      .mockResolvedValueOnce(json(page()))
      .mockResolvedValueOnce(json({ ...account, id: 4 }, 201))
      .mockResolvedValueOnce(json(page()));
    openAccounts(fetchMock);
    const events = userEvent.setup();

    await events.click(await screen.findByRole("link", { name: "Create User" }));
    await events.type(screen.getByLabelText("Full name"), "New Teacher");
    await events.type(screen.getByLabelText("Email"), "new@example.test");
    await events.type(screen.getByLabelText("Initial password"), "Temporary123!");
    await events.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(window.location.pathname).toBe("/admin/users"));
  });

  it("keeps set-password drafts after a 422 response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(admin))
      .mockResolvedValueOnce(json(page()))
      .mockResolvedValueOnce(json({ new_password: ["Too common."] }, 422));
    openAccounts(fetchMock);
    const events = userEvent.setup();

    await screen.findByText("ada@example.test");
    await events.click(screen.getByRole("button", { name: "Actions for ada@example.test" }));
    await events.click(screen.getByRole("menuitem", { name: "Change password ada@example.test" }));
    await events.type(screen.getByLabelText("New password"), "Temporary123!");
    await events.type(screen.getByLabelText("Confirm new password"), "Temporary123!");
    await events.click(screen.getByRole("button", { name: "Set password" }));

    expect(await screen.findByText("Too common.")).toBeTruthy();
    expect((screen.getByLabelText(/^New password/) as HTMLInputElement).value).toBe("Temporary123!");
  });

  it("keeps the confirmation open and displays an active-Class 422", async () => {
    const detail = "Accounts assigned to or enrolled in an active Class cannot be disabled or deleted.";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(admin))
      .mockResolvedValueOnce(json(page([{ ...account, is_active: true }])))
      .mockResolvedValueOnce(json({ detail }, 422));
    openAccounts(fetchMock);
    const events = userEvent.setup();

    await screen.findByText("ada@example.test");
    await events.click(screen.getByRole("button", { name: "Actions for ada@example.test" }));
    await events.click(screen.getByRole("menuitem", { name: "Disable ada@example.test" }));
    await events.click(screen.getByRole("button", { name: "Disable account" }));

    expect((await screen.findByRole("alert")).textContent).toContain("active Class");
    expect(screen.getByRole("dialog", { name: "Disable account" })).toBeTruthy();
  });

  it("removes a deleted account after refreshing the same list", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(admin))
      .mockResolvedValueOnce(json(page()))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json(page([])));
    openAccounts(fetchMock);
    const events = userEvent.setup();

    await screen.findByText("ada@example.test");
    await events.click(screen.getByRole("button", { name: "Actions for ada@example.test" }));
    await events.click(screen.getByRole("menuitem", { name: "Delete ada@example.test" }));
    await events.click(screen.getByRole("button", { name: "Delete account" }));

    expect(await screen.findByText("No accounts found.")).toBeTruthy();
    expect(screen.queryByText("ada@example.test")).toBeNull();
  });

  it("renders loading, failure, empty, and table states", async () => {
    let resolveUsers!: (response: Response) => void;
    const users = new Promise<Response>((resolve) => { resolveUsers = resolve; });
    openAccounts(vi.fn().mockResolvedValueOnce(json(admin)).mockReturnValueOnce(users));
    expect(await screen.findByRole("status", { name: "Loading accounts" })).toBeTruthy();
    resolveUsers(json(page([])));
    expect(await screen.findByText("No accounts found.")).toBeTruthy();
  });

  it("offers retry after list loading fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(admin))
      .mockResolvedValueOnce(json({ detail: "Unavailable" }, 500))
      .mockResolvedValueOnce(json(page()));
    openAccounts(fetchMock);
    const events = userEvent.setup();

    expect((await screen.findByRole("alert")).textContent).toContain("Unavailable");
    await events.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("ada@example.test")).toBeTruthy();
  });
});
