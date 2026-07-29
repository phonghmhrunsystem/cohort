import type { InputHTMLAttributes, ReactNode } from "react";

export function Field({ id, label, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: ReactNode }) {
  const errorId = `${id}-error`;
  return <label className="field" htmlFor={id}><span>{label}</span><input id={id} aria-describedby={error ? errorId : undefined} {...props} />{error && <span id={errorId} role="alert">{error}</span>}</label>;
}
