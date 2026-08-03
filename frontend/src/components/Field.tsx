import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

type Labelled = { label: string; error?: ReactNode; hint?: ReactNode; wide?: boolean };

const describedBy = (id: string | undefined, hint?: ReactNode, error?: ReactNode) =>
  [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;

// Label sits directly above the control and hint/error below it, so every control in a row lines up.
function Wrapper({ id, label, hint, error, required, wide, children }: Labelled & { id?: string; required?: boolean; children: ReactNode }) {
  return <div className={`field${required ? " field-required" : ""}${wide ? " field-full" : ""}`}>
    <label htmlFor={id}>{label}</label>
    {children}
    {hint && <span className="field-hint" id={`${id}-hint`}>{hint}</span>}
    {error && <span className="field-error" id={`${id}-error`} role="alert">{error}</span>}
  </div>;
}

export function Field({ id, label, error, hint, wide, adornment, ...props }: InputHTMLAttributes<HTMLInputElement> & Labelled & { adornment?: ReactNode }) {
  const input = <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...props} />;
  return <Wrapper id={id} label={label} hint={hint} error={error} required={props.required} wide={wide}>
    {adornment ? <div className="field-adorned">{input}{adornment}</div> : input}
  </Wrapper>;
}

export function Select({ id, label, error, hint, wide, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & Labelled) {
  return <Wrapper id={id} label={label} hint={hint} error={error} required={props.required} wide={wide}>
    <select id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...props}>{children}</select>
  </Wrapper>;
}

export function Textarea({ id, label, error, hint, wide, rows = 4, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & Labelled & { rows?: number }) {
  return <Wrapper id={id} label={label} hint={hint} error={error} required={props.required} wide={wide}>
    <textarea id={id} rows={rows} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...props} />
  </Wrapper>;
}
