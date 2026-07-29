import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Outlet } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";

export function AppShell({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia?.("(max-width: 1023px)").matches ?? true);
  const drawerTabIndex = mobile && !open ? -1 : undefined;
  const { user, logout } = useAuth();
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
  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={() => document.getElementById("main-content")?.focus()}>Skip to main content</a>
    {open && <button className="drawer-backdrop" aria-label="Close menu" onClick={closeDrawer} />}
    <aside ref={drawer} className={open ? "sidebar open" : "sidebar"} aria-label="Main navigation" aria-hidden={mobile && !open} inert={mobile && !open}>
      <strong>Class Management</strong>
      <button className="drawer-close" aria-label="Close navigation" tabIndex={drawerTabIndex} onClick={closeDrawer}>&times;</button>
      <nav><Link to="/dashboard" tabIndex={drawerTabIndex} onClick={closeDrawer}>Dashboard</Link>{user?.role === "ADMIN" ? <><Link to="/admin/users" tabIndex={drawerTabIndex} onClick={closeDrawer}>Accounts</Link><Link to="/classes" tabIndex={drawerTabIndex} onClick={closeDrawer}>Classes</Link><Link to="/audit" tabIndex={drawerTabIndex} onClick={closeDrawer}>Audit</Link></> : <><Link to="/classes" tabIndex={drawerTabIndex} onClick={closeDrawer}>My Classes</Link><Link to="/profile" tabIndex={drawerTabIndex} onClick={closeDrawer}>Profile</Link><Link to="/notifications" tabIndex={drawerTabIndex} onClick={closeDrawer}>Notifications</Link></>}</nav>
    </aside>
    <main id="main-content" className="canvas" tabIndex={-1}><header><button ref={menuButton} className="menu-button" aria-label="Open menu" onClick={() => setOpen(true)}>&#9776;</button><span>{user?.full_name}</span><button aria-label="Sign out" onClick={() => void logout()}>Sign out</button></header>{children ?? <Outlet />}</main>
  </div>;
}
