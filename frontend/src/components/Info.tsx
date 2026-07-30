export function Info({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return <div className={wide ? "field-full" : undefined}><dt>{label}</dt><dd>{value || "—"}</dd></div>;
}
