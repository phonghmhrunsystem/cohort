export function Spinner({ label = "Loading" }: { label?: string }) { return <p role="status" className="spinner">{label}</p>; }
