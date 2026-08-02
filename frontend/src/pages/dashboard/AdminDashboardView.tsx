import { StatCard } from "../../components/StatCard";
import type { AdminDashboard } from "../../types";

export function AdminDashboardView({ data }: { data: AdminDashboard }) {
  return <section className="page-stack">
    <div className="page-header"><h1>Tổng quan</h1></div>
    <div className="stat-grid"><StatCard label="Tài khoản" value={data.accounts.students} /></div>
  </section>;
}
