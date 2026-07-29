import { useEffect, useId, useRef, type ReactNode } from "react";

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
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
  return <dialog ref={dialog} onClose={onClose} aria-labelledby={titleId}><h2 id={titleId}>{title}</h2>{children}<button aria-label="Close dialog" onClick={() => dialog.current?.close()}>×</button></dialog>;
}
