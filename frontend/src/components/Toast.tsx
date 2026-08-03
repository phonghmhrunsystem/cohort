import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastKind = "success" | "warning" | "error";
type ToastEntry = { id: number; kind: ToastKind; message: string };

const ToastContext = createContext<((kind: ToastKind, message: string) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++nextId.current;
    setToasts((current) => [...current, { id, kind, message }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000);
  }, []);

  return <ToastContext.Provider value={push}>
    {children}
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => <div key={toast.id} className={`toast toast-${toast.kind}`}>
        {toast.message}
        <button type="button" aria-label="Dismiss notification" onClick={() => setToasts((current) => current.filter((entry) => entry.id !== toast.id))}>×</button>
      </div>)}
    </div>
  </ToastContext.Provider>;
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error("useToast must be used within a ToastProvider");
  return { success: (message: string) => push("success", message), warning: (message: string) => push("warning", message), error: (message: string) => push("error", message) };
}
