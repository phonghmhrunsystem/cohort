import { ReactNode } from "react";

import { logout, User } from "./auth";
import { redirectToLogin } from "./session";

const links = {
  ADMIN: [["/admin/users", "Accounts"], ["/admin/classes", "Classes"], ["/admin/audit-logs", "Audit log"]],
  TEACHER: [["/teacher/classes", "My Classes"]],
  STUDENT: [["/student/classes", "My Classes"]],
} as const;

export function AppShell({ user, children }: { user: User; children: ReactNode }) {
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
      <nav className="workspace-nav nav nav-pills flex-column gap-1" aria-label={`${user.role} navigation`}>
        {links[user.role].map(([href, label]) => <a className="nav-link" href={href} aria-current={location.pathname === href ? "page" : undefined} key={href}>{label}</a>)}
        <button className="workspace-logout nav-link text-start border-0" type="button" onClick={() => void signOut()}>Logout</button>
      </nav>
    </aside>
    <main className="workspace-content p-3 p-lg-4">{children}</main>
  </div>;
}
