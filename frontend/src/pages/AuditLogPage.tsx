import { useEffect, useState } from "react";

import { api } from "../api";

type AuditLog = {
  id: number;
  actor_id: number | null;
  actor: { id: number; full_name: string | null; email: string } | null;
  action: string;
  target_type: string;
  target_id: number;
  metadata: Record<string, unknown>;
  created_at: string;
};

const safeMetadataKeys = new Set(["is_active", "teacher_id", "cohort_id", "student_id"]);

function displayMetadata(metadata: Record<string, unknown>) {
  const safe = Object.fromEntries(Object.entries(metadata).filter(([key, value]) =>
    safeMetadataKeys.has(key) && (typeof value === "boolean" || value === null || typeof value === "number" && Number.isFinite(value)),
  ));
  return Object.keys(safe).length ? JSON.stringify(safe) : "â€”";
}

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { void (async () => {
    try {
      setLogs(await api<AuditLog[]>("/audit-logs"));
    } catch (response) {
      setError((response as { detail?: string }).detail ?? "Unable to load audit logs.");
    } finally {
      setLoading(false);
    }
  })(); }, []);

  return <>
    <header className="mb-4"><h1 className="h2 mb-1">Audit log</h1><p className="text-secondary mb-0">Review account and learning activity.</p></header>
    <section className="card shadow-sm border-0"><div className="card-body p-0">
      {loading ? <div className="alert alert-secondary mb-0">Loading audit log…</div>
        : error ? <div className="alert alert-danger mb-0" role="alert">{error}</div>
        : logs.length === 0 ? <div className="alert alert-secondary mb-0">No audit entries yet.</div>
        : <div className="table-responsive"><table className="table table-hover align-middle mb-0">
          <thead className="table-light"><tr><th>Timestamp</th><th>Actor</th><th>Event</th><th>Target</th><th>Safe metadata</th></tr></thead>
          <tbody>{logs.map((log) => <tr key={log.id}>
            <td className="text-nowrap">{new Date(log.created_at).toLocaleString()}</td>
            <td>{log.actor ? <><span className="d-block">{log.actor.full_name || log.actor.email}</span><small className="text-secondary">{log.actor.email}</small></> : "System"}</td>
            <td><span className="badge text-bg-secondary">{log.action}</span></td>
            <td>{log.target_type} #{log.target_id}</td>
            <td><code className="small text-break">{displayMetadata(log.metadata)}</code></td>
          </tr>)}</tbody>
        </table></div>}
    </div></section>
  </>;
}
