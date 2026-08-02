import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { NotificationBell } from "../../components/NotificationBell";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});
const notification = (overrides = {}) => ({
  id: 1, type: "ASSIGNMENT_CREATED", title: "Bài tập mới: Homework 2",
  link: "/student/assignments/1", created_at: new Date().toISOString(), read_at: null, ...overrides,
});

function openShell(fetchMock: ReturnType<typeof vi.fn>) {
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><NotificationBell /></MemoryRouter>);
}

describe("Notification bell", () => {
  afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); });

  it("shows no badge until an unread count arrives", async () => {
    openShell(vi.fn().mockResolvedValue(json({ unread_count: 0, items: [] })));
    await userEvent.click(screen.getByRole("button", { name: /Thông báo/ }));
    await screen.findByText("Chưa có thông báo nào.");
    expect(screen.queryByTestId("notification-badge")).toBeNull();
  });

  it("fetches on open and lists items with a relative time", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ unread_count: 1, items: [notification()] }));
    openShell(fetchMock);
    await userEvent.click(screen.getByRole("button", { name: /Thông báo/ }));
    expect(await screen.findByText("Bài tập mới: Homework 2")).toBeTruthy();
    expect(screen.getByText("Vừa xong")).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/notifications");
  });

  it("renders a linkless row as text, not a link", async () => {
    openShell(vi.fn().mockResolvedValue(json({
      unread_count: 1,
      items: [notification({ type: "CLASS_UNASSIGNED", title: "Unassigned from Cohort 5", link: null })],
    })));
    await userEvent.click(screen.getByRole("button", { name: /Thông báo/ }));
    await screen.findByText("Unassigned from Cohort 5");
    expect(screen.queryByRole("link", { name: /Unassigned/ })).toBeNull();
  });

  it("marks everything read optimistically and clears the badge", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ unread_count: 2, items: [notification(), notification({ id: 2, title: "Tài liệu mới: Slides" })] }))
      .mockResolvedValueOnce(json({ unread_count: 0 }));
    openShell(fetchMock);
    await userEvent.click(screen.getByRole("button", { name: /Thông báo/ }));
    await screen.findByText("Bài tập mới: Homework 2");
    await userEvent.click(screen.getByRole("button", { name: "Đánh dấu đã đọc tất cả" }));
    await waitFor(() => expect(screen.queryByTestId("notification-badge")).toBeNull());
    expect(fetchMock.mock.calls[1][0]).toBe("/api/notifications/read-all");
  });

  it("rolls the badge back when read-all fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ unread_count: 2, items: [notification(), notification({ id: 2, title: "Tài liệu mới: Slides" })] }))
      .mockResolvedValueOnce(json({ detail: "boom" }, 500));
    openShell(fetchMock);
    await userEvent.click(screen.getByRole("button", { name: /Thông báo/ }));
    await screen.findByText("Bài tập mới: Homework 2");
    await userEvent.click(screen.getByRole("button", { name: "Đánh dấu đã đọc tất cả" }));
    expect((await screen.findByTestId("notification-badge")).textContent).toBe("2");
  });

  it("keeps the loaded items and does not zero the badge when the fetch fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ unread_count: 1, items: [notification()] }))
      .mockResolvedValueOnce(json({ detail: "boom" }, 500));
    openShell(fetchMock);
    const bell = screen.getByRole("button", { name: /Thông báo/ });
    await userEvent.click(bell);
    await screen.findByText("Bài tập mới: Homework 2");
    await userEvent.click(bell);
    await userEvent.click(bell);
    expect(await screen.findByText("Không tải được thông báo.")).toBeTruthy();
    expect(screen.getByText("Bài tập mới: Homework 2")).toBeTruthy();
    expect(screen.getByTestId("notification-badge").textContent).toBe("1");
  });

  it("closes on Escape and returns focus to the bell", async () => {
    openShell(vi.fn().mockResolvedValue(json({ unread_count: 0, items: [] })));
    const bell = screen.getByRole("button", { name: /Thông báo/ });
    await userEvent.click(bell);
    await screen.findByText("Chưa có thông báo nào.");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Chưa có thông báo nào.")).toBeNull());
    expect(document.activeElement).toBe(bell);
  });
});
