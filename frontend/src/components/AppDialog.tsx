import { ReactNode, RefObject, useEffect, useId, useRef } from "react";

export function AppDialog({ open, title, pending = false, fallbackFocus, onClose, formId, submitLabel, submitDisabled, children }: {
  open: boolean;
  title: string;
  pending?: boolean;
  fallbackFocus?: RefObject<HTMLElement | null>;
  onClose: () => void;
  formId?: string;
  submitLabel?: string;
  submitDisabled?: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
    } else if (!open && element.open) {
      element.close();
      (opener.current?.isConnected ? opener.current : fallbackFocus?.current)?.focus();
    }
  }, [open, fallbackFocus]);

  function close() {
    if (!pending) onClose();
  }

  return <dialog ref={dialog} className="app-dialog border-0 rounded-3 shadow" aria-labelledby={titleId} onCancel={(event) => {
    event.preventDefault();
    close();
  }} onClick={(event) => {
    if (event.target === event.currentTarget) close();
  }}>
    <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
      <h2 className="h4 mb-0" id={titleId}>{title}</h2>
      <button className="btn-close" type="button" aria-label="Đóng" disabled={pending} onClick={close} />
    </div>
    {children}
    <div className="d-flex justify-content-end gap-2 mt-3">
      <button className="btn btn-outline-secondary" type="button" disabled={pending} onClick={close}>Cancel</button>
      {submitLabel && <button className="btn btn-primary" type="submit" form={formId} disabled={pending || submitDisabled}>{submitLabel}</button>}
    </div>
  </dialog>;
}
