import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Outlet } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { Icon } from "./Icon";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";

export function AppShell({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia?.("(max-width: 1023px)").matches ?? true);
  const drawerTabIndex = mobile && !open ? -1 : undefined;
  const { user } = useAuth();
  const drawer = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeDrawer = () => {
    setOpen(false);
    if (mobile) menuButton.current?.focus();
  };
  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia("(max-width: 1023px)");
    const update = () => {
      setMobile(query.matches);
      if (!query.matches) setOpen(false);
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open) return;
    const controls = () => Array.from(drawer.current?.querySelectorAll<HTMLElement>("button, a[href]") ?? []);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", escape);
    controls()[0]?.focus();
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className={collapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
    <a className="skip-link" href="#main-content" onClick={() => document.getElementById("main-content")?.focus()}>Skip to main content</a>
    {open && <button className="drawer-backdrop" aria-label="Close menu" onClick={closeDrawer} />}
    <aside ref={drawer} className={open ? "sidebar open" : collapsed ? "sidebar collapsed" : "sidebar"} aria-label="Main navigation" aria-hidden={mobile && !open} inert={mobile && !open}>
      <div className="sidebar-head">
        <strong className="brand-label">Class Management</strong>
        <button className="drawer-close" aria-label="Close navigation" tabIndex={drawerTabIndex} onClick={closeDrawer}>&times;</button>
        <button type="button" className="sidebar-toggle" tabIndex={drawerTabIndex} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>
          <span className="sidebar-toggle-icon"><Icon name="panelLeft" /></span>
        </button>
      </div>
      <nav>
        <Link className="nav-link" to="/dashboard" aria-label="Dashboard" tabIndex={drawerTabIndex} onClick={closeDrawer}><Icon name="home" /><span className="nav-label">Dashboard</span></Link>
        {user?.role === "ADMIN" ? <>
          <Link className="nav-link" to="/admin/users" aria-label="Accounts" tabIndex={drawerTabIndex} onClick={closeDrawer}><Icon name="users" /><span className="nav-label">Accounts</span></Link>
          <Link className="nav-link" to="/admin/classes" aria-label="Classes" tabIndex={drawerTabIndex} onClick={closeDrawer}><Icon name="bookOpen" /><span className="nav-label">Classes</span></Link>
          <Link className="nav-link" to="/admin/audit-logs" aria-label="Audit" tabIndex={drawerTabIndex} onClick={closeDrawer}><Icon name="shield" /><span className="nav-label">Audit</span></Link>
        </> : <>
          <Link className="nav-link" to={user?.role === "TEACHER" ? "/teacher/classes" : "/student/classes"} aria-label="My Classes" tabIndex={drawerTabIndex} onClick={closeDrawer}><Icon name="bookOpen" /><span className="nav-label">My Classes</span></Link>
        </>}
      </nav>
    </aside>
    <main id="main-content" className="canvas" tabIndex={-1}>
      <header>
        <button ref={menuButton} className="menu-button" aria-label="Open menu" onClick={() => setOpen(true)}>&#9776;</button>
        <div className="header-actions">
          {user?.role !== "ADMIN" && <NotificationBell />}
          <UserMenu />
        </div>
      </header>
      {children ?? <Outlet />}
    </main>
  </div>;
}
