import { StatCard } from "../../components/StatCard";
import type { TeacherDashboard } from "../../types";

export function TeacherDashboardView({ data }: { data: TeacherDashboard }) {
  return <section className="page-stack">
    <div className="page-header"><h1>Tổng quan</h1></div>
    <div className="stat-grid"><StatCard label="Bài chờ chấm" value={data.cards.pending_grading} tone="warn" /></div>
  </section>;
}
