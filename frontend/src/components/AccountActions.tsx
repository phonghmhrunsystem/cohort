import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { User } from "../types";

export function AccountActions({
  account,
  onPassword,
  onStatus,
  onDelete,
}: {
  account: User;
  onPassword: () => void;
  onStatus: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const label = (action: string) => `${action} ${account.email}`;
  const run = (action: () => void) => { setOpen(false); action(); };
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
  return <div ref={container} className="action-menu" onKeyDown={(event) => {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
    }
    if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" className="action-menu-trigger" aria-label={`Actions for ${account.email}`} aria-haspopup="menu" aria-controls={menuId} aria-expanded={open} onClick={() => setOpen(!open)}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
    </button>
    {open && <div id={menuId} role="menu" aria-label={`Actions for ${account.email}`} className="action-menu-panel">
      <Link role="menuitem" aria-label={label("View")} to={`/admin/users/${account.id}`} onClick={() => setOpen(false)}>View</Link>
      <button role="menuitem" aria-label={label("Change password")} onClick={() => run(onPassword)}>Change password</button>
      <button role="menuitem" aria-label={label(account.is_active ? "Disable" : "Enable")} onClick={() => run(onStatus)}>{account.is_active ? "Disable" : "Enable"}</button>
      <button role="menuitem" aria-label={label("Delete")} className="danger-text" onClick={() => run(onDelete)}>Delete</button>
    </div>}
  </div>;
}
