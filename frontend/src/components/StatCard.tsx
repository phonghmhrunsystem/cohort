export function StatCard({ label, value, tone = "default" }: {
  label: string;
  value: number | null;
  tone?: "default" | "warn";
}) {
  return <div className={`stat-card${tone === "warn" ? " stat-card--warn" : ""}`}>
    <span className="stat-card-value">{value === null ? "—" : value}</span>
    <span className="stat-card-label">{label}</span>
  </div>;
}
