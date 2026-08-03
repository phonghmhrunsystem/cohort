import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { AuditLogPage } from "../../pages/admin/AuditLogPage";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});
const log = (overrides = {}) => ({
  id: 1, actor_id: 1,
  actor: { id: 1, full_name: "Le Quoc Bao", email: "admin@example.test" },
  action: "account.created", target_type: "accounts.user", target_id: 7,
  target_label: "Student Tran Minh Anh", metadata: {},
  created_at: "2026-07-29T10:15:00Z", ...overrides,
});
const page = (results: unknown[], overrides = {}) =>
  ({ count: results.length, next: null, previous: null, results, ...overrides });

function openPage(fetchMock: ReturnType<typeof vi.fn>) {
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><AuditLogPage /></MemoryRouter>);
}

describe("Audit log page", () => {
  afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); });

  it("renders time, actor, readable action and resolved target", async () => {
    openPage(vi.fn().mockResolvedValue(json(page([log()]))));
    expect(await screen.findByText("Tạo tài khoản")).toBeTruthy();
    expect(screen.getByText("Student Tran Minh Anh")).toBeTruthy();
    expect(screen.getByText(/Le Quoc Bao/)).toBeTruthy();
  });

  it("reads class.status_changed off metadata", async () => {
    openPage(vi.fn().mockResolvedValue(json(page([
      log({ id: 2, action: "class.status_changed", metadata: { is_active: false }, target_label: "Cohort 5" }),
    ]))));
    expect(await screen.findByText("Tắt lớp")).toBeTruthy();
  });

  it("shows an unknown action as its raw code instead of dropping the row", async () => {
    openPage(vi.fn().mockResolvedValue(json(page([log({ id: 3, action: "something.new" })]))));
    expect(await screen.findByText("something.new")).toBeTruthy();
  });

  it("falls back to the raw target when the label could not be resolved", async () => {
    openPage(vi.fn().mockResolvedValue(json(page([log({ id: 4, target_label: "", target_type: "classes.class", target_id: 42 })]))));
    expect(await screen.findByText("classes.class #42")).toBeTruthy();
  });

  it("shows an empty state when nothing has been logged", async () => {
    openPage(vi.fn().mockResolvedValue(json(page([]))));
    expect(await screen.findByText("Chưa có hoạt động nào.")).toBeTruthy();
  });

  it("surfaces a load failure", async () => {
    openPage(vi.fn().mockResolvedValue(json({ detail: "boom" }, 500)));
    expect(await screen.findByText("Không tải được nhật ký.")).toBeTruthy();
  });

  it("asks the server for the next page instead of loading the whole log", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(page([log({ target_label: "Trang một" })], { count: 25, next: "?page=2" })))
      .mockResolvedValueOnce(json(page([log({ id: 11, target_label: "Trang hai" })], { count: 25, previous: "?page=1" })));
    openPage(fetchMock);

    expect(await screen.findByText("Trang một")).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/audit-logs");
    await userEvent.click(screen.getByRole("button", { name: "Page 2" }));

    expect(await screen.findByText("Trang hai")).toBeTruthy();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/audit-logs?page=2");
  });

  it("hides the pager when a single page holds the whole log", async () => {
    openPage(vi.fn().mockResolvedValue(json(page([log()]))));
    expect(await screen.findByText("Tạo tài khoản")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Page 2" })).toBeNull();
  });
});
