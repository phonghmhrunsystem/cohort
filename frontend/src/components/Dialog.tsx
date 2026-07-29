import { useEffect, useRef, type ReactNode } from "react";

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
    return () => { if (node.open) node.close(); };
  }, [open]);
  return <dialog ref={dialog} onClose={onClose} aria-labelledby="dialog-title"><h2 id="dialog-title">{title}</h2>{children}<button aria-label="Close dialog" onClick={() => dialog.current?.close()}>×</button></dialog>;
}
