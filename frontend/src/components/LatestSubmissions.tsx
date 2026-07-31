import { useState } from "react";

import { DownloadIcon, GradeIcon, IconButton, IconLinkButton } from "./IconButton";
import { Pagination } from "./Pagination";
import { DataTable, type Column } from "./Table";
import { downloadSubmission } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type { TeacherSubmissionRow } from "../types";

const PAGE_SIZE = 6;

export interface LatestSubmissionsProps {
  assignmentId: number;
  rows: TeacherSubmissionRow[];
}

export function LatestSubmissions({ assignmentId, rows }: LatestSubmissionsProps) {
  const [page, setPage] = useState(1);
  const submittedCount = rows.filter((row) => row.submission).length;
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
      key: "score",
      header: "Điểm",
      render: (row) => (row.submission && row.graded ? row.score : ""),
    },
    {
      key: "actions",
      header: "",
      render: (row) => {
        if (!row.submission) return null;
        return (
          <div className="row-actions">
            <IconButton
              icon={<DownloadIcon />}
              label="Tải"
              onClick={() => downloadSubmission(row.submission!.id, row.submission!.original_filename)}
            />
            {!row.graded && (
              <IconLinkButton
                icon={<GradeIcon />}
                label="Chấm"
                to={`/teacher/assignments/${assignmentId}/grade/${row.submission.id}`}
              />
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <p className="section-title">Bài nộp {submittedCount}/{rows.length}</p>
      <DataTable columns={columns} data={pageRows} rowKey={(row) => row.student_id} />
      <Pagination page={page} count={rows.length} pageSize={PAGE_SIZE} onChange={setPage} label="Danh sách bài nộp" />
    </>
  );
}
