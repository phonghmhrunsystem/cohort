import { useEffect, useId, useRef, type ReactNode } from "react";

export function Dialog({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) {
      opener.current = document.activeElement as HTMLElement | null;
      node.showModal();
    }
    if (!open && node.open) node.close();
    if (!open) opener.current?.focus();
  }, [open]);
  useEffect(() => () => {
    if (dialog.current?.open) dialog.current.close();
    opener.current?.focus();
  }, []);
  return <dialog ref={dialog} className={className} onClose={onClose} aria-labelledby={titleId}>
    <div className="dialog-header">
      <h2 id={titleId}>{title}</h2>
      <button type="button" className="dialog-close" aria-label="Close dialog" onClick={() => dialog.current?.close()}>×</button>
    </div>
    <div className="dialog-body">{children}</div>
  </dialog>;
}
