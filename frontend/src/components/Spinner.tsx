export function Spinner({ label = "Loading" }: { label?: string }) { return <p role="status" aria-label={label} className="spinner">{label}</p>; }
