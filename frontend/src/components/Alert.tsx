import type { ReactNode } from "react";

export function Alert({ children }: { children: ReactNode }) { return <p role="alert" className="alert">{children}</p>; }
