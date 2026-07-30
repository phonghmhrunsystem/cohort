import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { Icon } from "./Icon";

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (open) container.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);
  if (!user) return null;
  return <div ref={container} className="action-menu user-menu" onKeyDown={(event) => {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
    }
    if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" className="action-menu-trigger user-menu-trigger" aria-label={`Account menu for ${user.full_name}`} aria-haspopup="menu" aria-controls={menuId} aria-expanded={open} onClick={() => setOpen(!open)}>
      <Icon name="user" /><span className="user-menu-name">{user.full_name}</span>
    </button>
    {open && <div id={menuId} role="menu" aria-label="Account menu" className="action-menu-panel">
      <Link role="menuitem" to="/profile" onClick={() => setOpen(false)}><Icon name="user" />Profile</Link>
      <Link role="menuitem" to="/change-password" onClick={() => setOpen(false)}><Icon name="lock" />Change password</Link>
      <button role="menuitem" onClick={() => { setOpen(false); void logout(); }}><Icon name="logOut" />Log out</button>
    </div>}
  </div>;
}
