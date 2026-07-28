import { ReactNode, useEffect, useRef } from "react";

export function AppDialog({ open, title, pending = false, onClose, children }: {
  open: boolean;
  title: string;
  pending?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
    } else if (!open && element.open) {
      element.close();
      opener.current?.focus();
    }
  }, [open]);

  function close() {
    if (!pending) onClose();
  }

  return <dialog ref={dialog} className="app-dialog border-0 rounded-3 shadow" aria-labelledby="app-dialog-title" onCancel={(event) => {
    event.preventDefault();
    close();
  }} onClick={(event) => {
    if (event.target === event.currentTarget) close();
  }}>
    <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
      <h2 className="h4 mb-0" id="app-dialog-title">{title}</h2>
      <button className="btn-close" type="button" aria-label="Đóng" disabled={pending} onClick={close} />
    </div>
    {children}
    <div className="d-flex justify-content-end gap-2 mt-3">
      <button className="btn btn-outline-secondary" type="button" disabled={pending} onClick={close}>Cancel</button>
    </div>
  </dialog>;
}
