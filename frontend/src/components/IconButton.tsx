import { Link } from "react-router-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export const EyeIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>;
export const PowerIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v8" /><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /></svg>;
export const TrashIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>;

type IconButtonProps = {
  icon: ReactNode;
  label: string;
  variant?: "default" | "danger" | "active";
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function IconButton({ icon, label, variant = "default", title, className, ...rest }: IconButtonProps) {
  const variantClass = variant === "danger" ? "icon-button-danger" : variant === "active" ? "icon-button-active" : "";
  return <button type="button" className={["icon-button", variantClass, className].filter(Boolean).join(" ")} title={title ?? label} aria-label={label} {...rest}>{icon}</button>;
}

export function IconLinkButton({ icon, label, to }: { icon: ReactNode; label: string; to: string }) {
  return <Link to={to} className="icon-button" title={label} aria-label={label}>{icon}</Link>;
}
