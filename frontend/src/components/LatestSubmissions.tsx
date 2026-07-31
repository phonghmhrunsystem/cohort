import { Link } from "react-router-dom";

import { DataTable, type Column } from "./Table";
import { downloadSubmission } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type { TeacherSubmissionRow } from "../types";

export interface LatestSubmissionsProps {
  assignmentId: number;
  rows: TeacherSubmissionRow[];
}

export function LatestSubmissions({ assignmentId, rows }: LatestSubmissionsProps) {
  const submittedCount = rows.filter((row) => row.submission).length;

  const columns: Column<TeacherSubmissionRow>[] = [
    {
      key: "student",
      header: "Học viên",
      render: (row) => <>{row.student_name}{!row.is_active && <span className="tag-inactive"> đã tắt</span>}</>,
    },
    {
      key: "file",
      header: "File",
      render: (row) => (row.submission ? row.submission.original_filename : "chưa nộp"),
    },
    {
      key: "submitted_at",
      header: "Nộp lúc",
      render: (row) => (row.submission ? formatDateTime(row.submission.created_at) : ""),
    },
    {
      key: "actions",
      header: "",
      render: (row) => {
        if (!row.submission) return null;
        return (
          <>
            <button
              type="button"
              onClick={() => downloadSubmission(row.submission!.id, row.submission!.original_filename)}
            >
              Tải
            </button>{" "}
            {row.graded ? (
              <span>{row.score}</span>
            ) : (
              <Link to={`/teacher/assignments/${assignmentId}/grade/${row.submission.id}`}>Chấm</Link>
            )}
          </>
        );
      },
    },
  ];

  return (
    <>
      <p className="section-title">Bài nộp {submittedCount}/{rows.length}</p>
      <DataTable columns={columns} data={rows} rowKey={(row) => row.student_id} />
    </>
  );
}
