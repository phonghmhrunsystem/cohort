import { StatCard } from "../../components/StatCard";
import type { StudentDashboard } from "../../types";

export function StudentDashboardView({ data }: { data: StudentDashboard }) {
  return <section className="page-stack">
    <div className="page-header"><h1>Tổng quan</h1></div>
    <div className="stat-grid"><StatCard label="Bài chưa nộp" value={data.cards.not_submitted} tone="warn" /></div>
  </section>;
}
