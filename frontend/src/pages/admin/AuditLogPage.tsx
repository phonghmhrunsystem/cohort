import { useEffect, useRef, useState } from "react";

import { Alert } from "../../components/Alert";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { Pagination } from "../../components/Pagination";
import { Spinner } from "../../components/Spinner";
import { DataTable, TruncatedText, type Column } from "../../components/Table";
import { auditLogsPath, request } from "../../lib/api";
import { actionLabel } from "../../lib/auditActions";
import { formatDateTime } from "../../lib/format";
import type { AuditLog, Page } from "../../types";

const columns: Column<AuditLog>[] = [
  { key: "time", header: "Thời gian", width: "11rem", render: (log) => formatDateTime(log.created_at) },
  { key: "actor", header: "Người thực hiện", width: "14rem",
    render: (log) => <TruncatedText>{log.actor.full_name ?? log.actor.email}</TruncatedText> },
  { key: "action", header: "Hành động", width: "12rem", render: (log) => actionLabel(log) },
  /** Nhãn rỗng nghĩa là target không tra được (row đã xoá, hoặc action mới chưa
   * có luật phân giải) — hiện mã thô chứ không để trống (08 §2.1). */
  { key: "target", header: "Đối tượng", width: "18rem",
    render: (log) => <TruncatedText>{log.target_label || `${log.target_type} #${log.target_id}`}</TruncatedText> },
];

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AuditLog>>();
  const [failure, setFailure] = useState("");
  /** Bấm nhanh qua nhiều trang: chỉ phản hồi mới nhất được ghi vào state. */
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setFailure("");
    request<Page<AuditLog>>(auditLogsPath(page), { token: sessionStorage.getItem("access_token") ?? undefined })
      .then((value) => { if (current === generation.current && value) setData(value); })
      .catch(() => {
        if (current !== generation.current) return;
        setFailure("Không tải được nhật ký.");
        setData({ count: 0, next: null, previous: null, results: [] });
      });
  }, [page]);

  return <section className="page-stack">
    <h1>Nhật ký hoạt động</h1>
    <p className="muted">Theo dõi thay đổi về tài khoản và hoạt động học tập.</p>
    {failure && <Alert>{failure}</Alert>}
    <Card>
      {!data ? <Spinner label="Loading audit log" />
        : data.results.length === 0 && !failure ? <EmptyState>Chưa có hoạt động nào.</EmptyState>
          : <>
            <DataTable rowKey={(log) => log.id} data={data.results} columns={columns} />
            {data.count > 0 && <Pagination label="Audit log pagination" page={page} count={data.count} onChange={setPage} />}
          </>}
    </Card>
  </section>;
}
