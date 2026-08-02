import { useEffect, useState } from "react";

import { Alert } from "../../components/Alert";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { DataTable, TruncatedText, type Column } from "../../components/Table";
import { request } from "../../lib/api";
import { actionLabel } from "../../lib/auditActions";
import { formatDateTime } from "../../lib/format";
import type { AuditLog } from "../../types";

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
  const [logs, setLogs] = useState<AuditLog[]>();
  const [failure, setFailure] = useState("");
  useEffect(() => {
    request<AuditLog[]>("/audit-logs", { token: sessionStorage.getItem("access_token") ?? undefined })
      .then((value) => value && setLogs(value))
      .catch(() => { setFailure("Không tải được nhật ký."); setLogs([]); });
  }, []);
  return <section className="page-stack">
    <h1>Nhật ký hoạt động</h1>
    <p className="muted">Theo dõi thay đổi về tài khoản và hoạt động học tập.</p>
    {failure && <Alert>{failure}</Alert>}
    <Card>
      {!logs ? <Spinner label="Loading audit log" />
        : logs.length === 0 && !failure ? <EmptyState>Chưa có hoạt động nào.</EmptyState>
          : <DataTable rowKey={(log) => log.id} data={logs} columns={columns} />}
    </Card>
  </section>;
}
