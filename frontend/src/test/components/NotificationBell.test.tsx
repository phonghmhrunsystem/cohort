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

/** Bell gọi hai endpoint theo hai nhịp khác nhau (poll khi đóng, list khi mở),
 * nên mock định tuyến theo URL — xếp theo thứ tự gọi sẽ vỡ ngay khi nhịp đổi. */
type Routes = { list?: () => Response; count?: () => Response; readAll?: () => Response; read?: () => Response };

function openShell(routes: Routes) {
  sessionStorage.setItem("access_token", "token");
  const fetchMock = vi.fn((url: string) => {
    if (url === "/api/notifications/unread-count") return Promise.resolve((routes.count ?? (() => json({ unread_count: 0 })))());
    if (url === "/api/notifications/read-all") return Promise.resolve((routes.readAll ?? (() => json({ unread_count: 0 })))());
    if (url.endsWith("/read")) return Promise.resolve((routes.read ?? (() => json({})))());
    return Promise.resolve((routes.list ?? (() => json({ unread_count: 0, items: [] })))());
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><NotificationBell /></MemoryRouter>);
  return fetchMock;
}

const bellButton = () => screen.getByRole("button", { name: /Thông báo/ });

describe("Notification bell", () => {
  afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("shows no badge until an unread count arrives", async () => {
    openShell({ list: () => json({ unread_count: 0, items: [] }) });
    await userEvent.click(bellButton());
    await screen.findByText("Chưa có thông báo nào.");
    expect(screen.queryByTestId("notification-badge")).toBeNull();
  });

  it("shows the badge from the poll without the panel being opened", async () => {
    openShell({ count: () => json({ unread_count: 3 }) });
    expect((await screen.findByTestId("notification-badge")).textContent).toBe("3");
    expect(screen.queryByText("Chưa có thông báo nào.")).toBeNull();
  });

  it("refreshes the badge when the tab becomes visible again", async () => {
    let count = 1;
    openShell({ count: () => json({ unread_count: count }) });
    expect((await screen.findByTestId("notification-badge")).textContent).toBe("1");
    count = 4;
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(screen.getByTestId("notification-badge").textContent).toBe("4"));
  });

  it("does not poll while the tab is hidden", async () => {
    const hidden = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const fetchMock = openShell({ count: () => json({ unread_count: 2 }) });
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
    hidden.mockRestore();
  });

  it("fetches the list on open and lists items with a relative time", async () => {
    const fetchMock = openShell({ list: () => json({ unread_count: 1, items: [notification()] }) });
    await userEvent.click(bellButton());
    expect(await screen.findByText("Bài tập mới: Homework 2")).toBeTruthy();
    expect(screen.getByText("Vừa xong")).toBeTruthy();
    expect(fetchMock.mock.calls.some((call) => call[0] === "/api/notifications")).toBe(true);
  });

  it("renders a linkless row as text, not a link", async () => {
    openShell({
      list: () => json({
        unread_count: 1,
        items: [notification({ type: "CLASS_UNASSIGNED", title: "Unassigned from Cohort 5", link: null })],
      }),
    });
    await userEvent.click(bellButton());
    await screen.findByText("Unassigned from Cohort 5");
    expect(screen.queryByRole("link", { name: /Unassigned/ })).toBeNull();
  });

  it("marks everything read optimistically and clears the badge", async () => {
    const fetchMock = openShell({
      list: () => json({ unread_count: 2, items: [notification(), notification({ id: 2, title: "Tài liệu mới: Slides" })] }),
      count: () => json({ unread_count: 2 }),
    });
    await userEvent.click(bellButton());
    await screen.findByText("Bài tập mới: Homework 2");
    await userEvent.click(screen.getByRole("button", { name: "Đánh dấu đã đọc tất cả" }));
    await waitFor(() => expect(screen.queryByTestId("notification-badge")).toBeNull());
    expect(fetchMock.mock.calls.some((call) => call[0] === "/api/notifications/read-all")).toBe(true);
  });

  it("rolls the badge back when read-all fails", async () => {
    openShell({
      list: () => json({ unread_count: 2, items: [notification(), notification({ id: 2, title: "Tài liệu mới: Slides" })] }),
      readAll: () => json({ detail: "boom" }, 500),
    });
    await userEvent.click(bellButton());
    await screen.findByText("Bài tập mới: Homework 2");
    await userEvent.click(screen.getByRole("button", { name: "Đánh dấu đã đọc tất cả" }));
    expect((await screen.findByTestId("notification-badge")).textContent).toBe("2");
  });

  it("keeps the loaded items and does not zero the badge when the fetch fails", async () => {
    let listFails = false;
    openShell({
      list: () => listFails ? json({ detail: "boom" }, 500) : json({ unread_count: 1, items: [notification()] }),
      count: () => json({ unread_count: 1 }),
    });
    const bell = bellButton();
    await userEvent.click(bell);
    await screen.findByText("Bài tập mới: Homework 2");
    listFails = true;
    await userEvent.click(bell);
    await userEvent.click(bell);
    expect(await screen.findByText("Không tải được thông báo.")).toBeTruthy();
    expect(screen.getByText("Bài tập mới: Homework 2")).toBeTruthy();
    expect(screen.getByTestId("notification-badge").textContent).toBe("1");
  });

  it("closes on Escape and returns focus to the bell", async () => {
    openShell({});
    const bell = bellButton();
    await userEvent.click(bell);
    await screen.findByText("Chưa có thông báo nào.");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Chưa có thông báo nào.")).toBeNull());
    expect(document.activeElement).toBe(bell);
  });
});
