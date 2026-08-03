import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { StatCard } from "../../components/StatCard";
import { DataTable, TruncatedText, type Column } from "../../components/Table";
import { actionLabel } from "../../lib/auditActions";
import { formatDateTime } from "../../lib/format";
import type { AdminDashboard, AuditRow } from "../../types";

const auditColumns: Column<AuditRow>[] = [
  { key: "time", header: "Thời gian", width: "12rem", render: (row) => formatDateTime(row.created_at) },
  { key: "actor", header: "Người thực hiện", width: "14rem", render: (row) => <TruncatedText>{row.actor.full_name ?? ""}</TruncatedText> },
  // `/api/dashboard` không mang `metadata` theo (nó chỉ có ở `/api/audit-logs`),
  // nên dòng gọn này gọi `actionLabel` với metadata rỗng.
  { key: "action", header: "Hành động", width: "14rem", render: (row) => actionLabel({ action: row.action, metadata: {} }) },
  { key: "target", header: "Đối tượng", render: (row) => <TruncatedText>{row.target_label}</TruncatedText> },
];

export function AdminDashboardView({ data }: { data: AdminDashboard }) {
  return <section className="page-stack">
    <div className="page-header"><h1>Tổng quan</h1></div>

    <Card>
      <h2>Tài khoản</h2>
      <div className="stat-grid">
        <StatCard label="Quản trị viên" value={data.accounts.admins} />
        <StatCard label="Giảng viên" value={data.accounts.teachers} />
        <StatCard label="Học viên" value={data.accounts.students} />
      </div>
    </Card>

    <Card>
      <h2>Lớp học</h2>
      <div className="stat-grid">
        <StatCard label="Đang chạy" value={data.classes.running} />
        <StatCard label="Sắp bắt đầu" value={data.classes.scheduled} />
        <StatCard label="Đã kết thúc" value={data.classes.ended} />
        <StatCard label="Đã tắt" value={data.classes.disabled} />
      </div>
    </Card>

    <Card>
      <h2>Hoạt động gần đây</h2>
      {data.recent_audit.length === 0
        ? <EmptyState>Chưa có hoạt động nào.</EmptyState>
        : <DataTable columns={auditColumns} data={data.recent_audit} rowKey={(row) => row.id} />}
    </Card>
  </section>;
}
