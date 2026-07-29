import { ReactNode, useEffect, useState } from "react";

import { displayName, logout, User } from "./auth";
import { redirectToLogin } from "./session";
import { listNotifications, readNotification, Notification } from "./notifications";
import { BellIcon, BookIcon, ClipboardIcon, CloseIcon, KeyIcon, LogoutIcon, MenuIcon, UserIcon, UsersIcon } from "./components/icons";

const links = {
  ADMIN: [
    ["/admin/users", "Accounts", UsersIcon],
    ["/admin/password-reset-requests", "Password resets", KeyIcon],
    ["/admin/classes", "Classes", BookIcon],
    ["/admin/audit-logs", "Audit log", ClipboardIcon],
  ],
  TEACHER: [
    ["/teacher/classes", "My Classes", BookIcon],
    ["/profile", "Hồ sơ cá nhân", UserIcon],
  ],
  STUDENT: [
    ["/student/classes", "My Classes", BookIcon],
    ["/profile", "Hồ sơ cá nhân", UserIcon],
  ],
} as const;

const roleLabel = { ADMIN: "Quản trị viên", TEACHER: "Giáo viên", STUDENT: "Học sinh" } as const;

export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => { if (user.role !== "ADMIN") void listNotifications().then(({ items, unread_count }) => { setNotifications(items); setUnread(unread_count); }).catch(() => {}); }, [user.role]);
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") setDrawerOpen(false); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [drawerOpen]);

  async function signOut() {
    try {
      await logout();
    } catch {
      // Logout still ends the local session when the network request fails.
    }
    redirectToLogin();
  }

  const navItems = links[user.role];

  return <div className="workspace">
    <header className="workspace-topbar d-flex d-md-none align-items-center justify-content-between p-3">
      <button className="drawer-toggle" type="button" aria-label="Open menu" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}><MenuIcon /></button>
      <a className="workspace-brand" href={navItems[0][0]}>Class Management</a>
      <span className="workspace-topbar-spacer" aria-hidden="true" />
    </header>

    {drawerOpen && <div className="workspace-backdrop" onClick={() => setDrawerOpen(false)} />}

    <aside className={`workspace-sidebar p-3${drawerOpen ? " workspace-sidebar-open" : ""}`}>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <a className="workspace-brand fw-semibold text-white text-decoration-none d-block" href={navItems[0][0]}>Class Management</a>
        <button className="drawer-close d-md-none" type="button" aria-label="Close menu" onClick={() => setDrawerOpen(false)}><CloseIcon /></button>
      </div>
      <p className="workspace-identity text-white-50 small"><span className="d-block text-white">Chào, {displayName(user)}</span>{roleLabel[user.role]}</p>
      {user.role !== "ADMIN" && <details className="workspace-notifications text-white mb-3">
        <summary><BellIcon className="me-1" /> Notifications {unread ? <span className="badge notification-badge">{unread}</span> : ""}</summary>
        {notifications.length ? <ul className="ps-3 mt-2">{notifications.map((item) => <li key={item.id}><a className="text-white" href={item.link} onClick={() => void readNotification(item.id)}>{item.title}</a></li>)}</ul> : <small>No notifications.</small>}
      </details>}
      <nav className="workspace-nav nav nav-pills flex-column gap-1" aria-label={`${user.role} navigation`}>
        {navItems.map(([href, label, Icon]) => <a className="nav-link d-flex align-items-center gap-2" href={href} aria-current={location.pathname === href ? "page" : undefined} key={href} onClick={() => setDrawerOpen(false)}><Icon className="nav-icon" />{label}</a>)}
        <button className="workspace-logout nav-link d-flex align-items-center gap-2 text-start border-0" type="button" onClick={() => void signOut()}><LogoutIcon className="nav-icon" />Logout</button>
      </nav>
    </aside>
    <main className="workspace-content p-3 p-lg-4">{children}</main>
  </div>;
}
