import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { request } from "../lib/api";
import { relativeTime } from "../lib/format";
import type { Notification, NotificationList } from "../types";
import { Icon } from "./Icon";

/** type là CharField tự do ở backend (07 §4), nên map này luôn phải có đường lui. */
const TYPE_ICON: Record<string, { name: "clipboard" | "bookOpen" | "users" | "bell"; tone: "primary" | "accent" }> = {
  ASSIGNMENT_CREATED: { name: "clipboard", tone: "primary" },
  RESOURCE_CREATED: { name: "bookOpen", tone: "accent" },
  CLASS_ASSIGNED: { name: "users", tone: "primary" },
  CLASS_UNASSIGNED: { name: "users", tone: "primary" },
};
const iconFor = (type: string) => TYPE_ICON[type] ?? { name: "bell" as const, tone: "primary" as const };
const token = () => sessionStorage.getItem("access_token") ?? undefined;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [failure, setFailure] = useState("");
  const bell = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = () => { setOpen(false); bell.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    /** Chỉ fetch khi mở: không polling, không websocket (07 §2.1). */
    setFailure("");
    request<NotificationList>("/notifications", { token: token() })
      .then((value) => { if (!value) return; setItems(value.items); setUnread(value.unread_count); })
      /** Lỗi mạng không phải bằng chứng là đã đọc — giữ nguyên badge và danh sách cũ. */
      .catch(() => setFailure("Không tải được thông báo."));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !bell.current?.contains(target)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);

  const markOne = (notification: Notification) => {
    if (notification.read_at) return;
    const previous = { items, unread };
    setItems((rows) => rows.map((row) => row.id === notification.id ? { ...row, read_at: new Date().toISOString() } : row));
    setUnread((count) => Math.max(0, count - 1));
    request(`/notifications/${notification.id}/read`, { method: "POST", token: token() })
      .catch(() => { setItems(previous.items); setUnread(previous.unread); });
  };

  const markAll = () => {
    const previous = { items, unread };
    const now = new Date().toISOString();
    setItems((rows) => rows.map((row) => row.read_at ? row : { ...row, read_at: now }));
    setUnread(0);
    request("/notifications/read-all", { method: "POST", token: token() })
      .catch(() => { setItems(previous.items); setUnread(previous.unread); });
  };

  return <div className="notification-bell">
    <button
      ref={bell}
      type="button"
      className="notification-trigger"
      aria-expanded={open}
      aria-controls="notif-panel"
      aria-label={unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
      onClick={() => setOpen((value) => !value)}
    >
      <Icon name="bell" />
      {/* Badge rỗng đọc như một cái bug — không render khi bằng 0 (07 §2.1). */}
      {unread > 0 && <span className="notification-badge" data-testid="notification-badge">{unread > 99 ? "99+" : unread}</span>}
    </button>
    {open && <div id="notif-panel" ref={panel} className="notification-panel">
      <div className="notification-panel-head">
        <strong>Thông báo</strong>
        <button type="button" className="link-button" disabled={unread === 0} onClick={markAll}>Đánh dấu đã đọc tất cả</button>
      </div>
      {failure && <p className="notification-failure">{failure}</p>}
      {items.length === 0 && !failure
        ? <p className="notification-empty">Chưa có thông báo nào.</p>
        : <ul className="notification-list">
          {items.map((item) => {
            const icon = iconFor(item.type);
            const body = <>
              <span className={`notification-icon tone-${icon.tone}`}><Icon name={icon.name} /></span>
              <span className="notification-text">
                <span className="notification-title">{item.title}</span>
                <span className="notification-time">{relativeTime(item.created_at)}</span>
              </span>
            </>;
            return <li key={item.id} className={item.read_at ? "notification-item" : "notification-item unread"}>
              {!item.read_at && <span className="notification-dot" aria-hidden="true" />}
              {item.link
                ? <Link className="notification-row" to={item.link} onClick={() => { markOne(item); setOpen(false); }}>{body}</Link>
                /** link = null (CLASS_UNASSIGNED): vẫn đánh dấu đã đọc, không điều hướng. */
                : <button type="button" className="notification-row" onClick={() => markOne(item)}>{body}</button>}
            </li>;
          })}
        </ul>}
    </div>}
  </div>;
}
