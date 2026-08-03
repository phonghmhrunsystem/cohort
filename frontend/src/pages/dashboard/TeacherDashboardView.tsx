import { Link } from "react-router-dom";

import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { StatCard } from "../../components/StatCard";
import { DataTable, TruncatedText, type Column } from "../../components/Table";
import { formatDateTime } from "../../lib/format";
import type { DueSoonRow, PendingRow, TeacherDashboard } from "../../types";

const pendingColumns: Column<PendingRow>[] = [
  { key: "student", header: "Học viên", width: "14rem", render: (row) => <TruncatedText>{row.student.full_name ?? ""}</TruncatedText> },
  { key: "assignment", header: "Bài tập", width: "14rem", render: (row) => <TruncatedText>{row.assignment_title}</TruncatedText> },
  { key: "class", header: "Lớp", render: (row) => <TruncatedText>{row.class_name}</TruncatedText> },
  { key: "at", header: "Nộp lúc", width: "12rem", render: (row) => formatDateTime(row.submitted_at) },
  { key: "action", header: "", width: "6rem", render: (row) => <Link to={`/teacher/assignments/${row.assignment_id}/grade/${row.submission_id}`}>Chấm</Link> },
];

const dueSoonColumns: Column<DueSoonRow>[] = [
  { key: "title", header: "Bài tập", width: "14rem", render: (row) => <Link to={`/teacher/assignments/${row.assignment_id}`}>{row.title}</Link> },
  { key: "class", header: "Lớp", render: (row) => <TruncatedText>{row.class_name}</TruncatedText> },
  { key: "due", header: "Hạn nộp", width: "12rem", render: (row) => formatDateTime(row.due_at) },
  { key: "progress", header: "Đã nộp", width: "8rem", render: (row) => `${row.submitted_count}/${row.student_count}` },
];

export function TeacherDashboardView({ data }: { data: TeacherDashboard }) {
  return <section className="page-stack">
    <div className="page-header"><h1>Tổng quan</h1></div>

    <div className="stat-grid">
      <StatCard label="Lớp của tôi" value={data.cards.my_classes} />
      <StatCard label="Đang chạy" value={data.cards.running_classes} />
      <StatCard label="Bài đang mở" value={data.cards.open_assignments} />
      <StatCard label="Bài chờ chấm" value={data.cards.pending_grading} tone="warn" />
      <StatCard label="Học viên" value={data.cards.students} />
    </div>

    <Card>
      <h2>Chờ chấm</h2>
      {data.pending.length === 0
        ? <EmptyState>Không còn bài nào chờ chấm.</EmptyState>
        : <DataTable columns={pendingColumns} data={data.pending} rowKey={(row) => row.submission_id} />}
    </Card>

    <Card>
      <h2>Sắp tới hạn</h2>
      {data.due_soon.length === 0
        ? <EmptyState>Không có bài nào tới hạn trong 7 ngày tới.</EmptyState>
        : <DataTable columns={dueSoonColumns} data={data.due_soon} rowKey={(row) => row.assignment_id} />}
    </Card>
  </section>;
}
