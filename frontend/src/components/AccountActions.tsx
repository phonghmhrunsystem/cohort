import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [position, setPosition] = useState({ top: 0, left: 0, openUp: false });
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const label = (action: string) => `${action} ${account.email}`;
  const run = (action: () => void) => { setOpen(false); action(); };

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const menuHeight = 4 * 44 + 8;
    const rect = trigger.current!.getBoundingClientRect();
    const gap = 4;
    const openUp = window.innerHeight - rect.bottom < menuHeight;
    setPosition({ top: openUp ? rect.top - menuHeight - gap : rect.bottom + gap, left: Math.min(rect.right - 192, window.innerWidth - 200), openUp });
    setOpen(true);
  };
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onOutside);
    window.addEventListener("scroll", onScroll, true);
    return () => { document.removeEventListener("mousedown", onOutside); window.removeEventListener("scroll", onScroll, true); };
  }, [open]);
  return <div ref={container} className="action-menu" onKeyDown={(event) => {
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
    }
    if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" className="action-menu-trigger" aria-label={`Actions for ${account.email}`} aria-haspopup="menu" aria-controls={menuId} aria-expanded={open} onClick={toggle}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
    </button>
    {open && createPortal(
      <div ref={panel} id={menuId} role="menu" aria-label={`Actions for ${account.email}`} className="action-menu-panel action-menu-panel-floating" style={{ top: position.top, left: position.left, transformOrigin: position.openUp ? "bottom" : "top" }} onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
      }}>
        <Link role="menuitem" aria-label={label("View")} to={`/admin/users/${account.id}`} onClick={() => setOpen(false)}>View</Link>
        <button role="menuitem" aria-label={label("Change password")} onClick={() => run(onPassword)}>Change password</button>
        <button role="menuitem" aria-label={label(account.is_active ? "Disable" : "Enable")} onClick={() => run(onStatus)}>{account.is_active ? "Disable" : "Enable"}</button>
        <button role="menuitem" aria-label={label("Delete")} className="danger-text" onClick={() => run(onDelete)}>Delete</button>
      </div>,
      document.body,
    )}
  </div>;
}
