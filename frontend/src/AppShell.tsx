import { ReactNode, useEffect, useState } from "react";

import { displayName, logout, User } from "./auth";
import { redirectToLogin } from "./session";
import { listNotifications, readNotification, Notification } from "./notifications";

const links = {
  ADMIN: [["/admin/users", "Accounts"], ["/admin/password-reset-requests", "Password resets"], ["/admin/classes", "Classes"], ["/admin/audit-logs", "Audit log"]],
  TEACHER: [["/teacher/classes", "My Classes"], ["/profile", "Hồ sơ cá nhân"]],
  STUDENT: [["/student/classes", "My Classes"], ["/profile", "Hồ sơ cá nhân"]],
} as const;

const roleLabel = { ADMIN: "Quản trị viên", TEACHER: "Giáo viên", STUDENT: "Học sinh" } as const;

export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  useEffect(() => { if (user.role !== "ADMIN") void listNotifications().then(({ items, unread_count }) => { setNotifications(items); setUnread(unread_count); }).catch(() => {}); }, [user.role]);
  async function signOut() {
    try {
      await logout();
    } catch {
      // Logout still ends the local session when the network request fails.
    }
    redirectToLogin();
  }

  return <div className="workspace">
    <aside className="workspace-sidebar p-3">
      <a className="text-white text-decoration-none fw-semibold d-block mb-4" href={links[user.role][0][0]}>Class Management</a>
      <p className="workspace-identity text-white-50 small"><span className="d-block text-white">Chào, {displayName(user)}</span>{roleLabel[user.role]}</p>
      {user.role !== "ADMIN" && <details className="text-white mb-3"><summary>Notifications {unread ? `(${unread})` : ""}</summary>{notifications.length ? <ul className="ps-3 mt-2">{notifications.map((item) => <li key={item.id}><a className="text-white" href={item.link} onClick={() => void readNotification(item.id)}>{item.title}</a></li>)}</ul> : <small>No notifications.</small>}</details>}
      <nav className="workspace-nav nav nav-pills flex-column gap-1" aria-label={`${user.role} navigation`}>
        {links[user.role].map(([href, label]) => <a className="nav-link" href={href} aria-current={location.pathname === href ? "page" : undefined} key={href}>{label}</a>)}
        <button className="workspace-logout nav-link text-start border-0" type="button" onClick={() => void signOut()}>Logout</button>
      </nav>
    </aside>
    <main className="workspace-content p-3 p-lg-4">{children}</main>
  </div>;
}
