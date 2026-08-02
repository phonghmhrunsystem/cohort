import { Link } from "react-router-dom";

import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { StatCard } from "../../components/StatCard";
import { DataTable, TruncatedText, type Column } from "../../components/Table";
import { formatDateTime } from "../../lib/format";
import type { RecentGradeRow, StudentDashboard, TodoRow } from "../../types";

const todoColumns: Column<TodoRow>[] = [
  { key: "title", header: "Bài tập", width: "16rem", render: (row) => <Link to={`/student/assignments/${row.assignment_id}`}>{row.title}</Link> },
  { key: "class", header: "Lớp", render: (row) => <TruncatedText>{row.class_name}</TruncatedText> },
  { key: "due", header: "Hạn nộp", width: "12rem", render: (row) => formatDateTime(row.due_at) },
];

const gradeColumns: Column<RecentGradeRow>[] = [
  { key: "title", header: "Bài tập", width: "16rem", render: (row) => <TruncatedText>{row.title}</TruncatedText> },
  { key: "class", header: "Lớp", render: (row) => <TruncatedText>{row.class_name}</TruncatedText> },
  { key: "score", header: "Điểm", width: "8rem", render: (row) => `${row.score}/${row.maximum_score}` },
  { key: "at", header: "Chấm lúc", width: "12rem", render: (row) => formatDateTime(row.graded_at) },
];

export function StudentDashboardView({ data }: { data: StudentDashboard }) {
  return <section className="page-stack">
    <div className="page-header"><h1>Tổng quan</h1></div>

    <div className="stat-grid">
      <StatCard label="Lớp đang học" value={data.cards.my_classes} />
      <StatCard label="Bài chưa nộp" value={data.cards.not_submitted} tone="warn" />
      <StatCard label="Bài đã chấm" value={data.cards.graded} />
      <StatCard label="Điểm trung bình" value={data.cards.average_score} />
    </div>

    <Card>
      <h2>Cần nộp</h2>
      {data.todo.length === 0
        ? <EmptyState>Không có bài nào cần nộp.</EmptyState>
        : <DataTable columns={todoColumns} data={data.todo} rowKey={(row) => row.assignment_id} />}
    </Card>

    <Card>
      <h2>Điểm gần đây</h2>
      {data.recent_grades.length === 0
        ? <EmptyState>Chưa có điểm nào.</EmptyState>
        : <DataTable columns={gradeColumns} data={data.recent_grades} rowKey={(row) => row.assignment_id} />}
    </Card>
  </section>;
}
