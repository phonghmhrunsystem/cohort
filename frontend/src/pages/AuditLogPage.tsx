import { useEffect, useState } from "react";

import { api } from "../api";

type AuditLog = { id: number; actor_id: number | null; action: string; target_type: string; target_id: number; metadata: Record<string, unknown>; created_at: string };

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { void (async () => {
    try {
      setLogs(await api<AuditLog[]>("/audit-logs"));
    } catch (response) { setError((response as { detail?: string }).detail ?? "Unable to load audit logs."); }
    finally { setLoading(false); }
  })(); }, []);

  return <>
      <h1 className="h2 mb-4">Audit log</h1>
      <section className="card shadow-sm border-0"><div className="card-body p-0">
        {loading ? <div className="alert alert-secondary mb-0">Loading audit log…</div> : error ? <div className="alert alert-danger mb-0" role="alert">{error}</div> : logs.length === 0 ? <div className="alert alert-secondary mb-0">No audit entries yet.</div> : <div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead className="table-light"><tr><th>When</th><th>Action</th><th>Actor</th><th>Target</th><th>Details</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}>
          <td>{new Date(log.created_at).toLocaleString()}</td><td><span className="badge text-bg-secondary">{log.action}</span></td><td>{log.actor_id ?? "System"}</td><td>{log.target_type} #{log.target_id}</td><td><code className="small text-break">{JSON.stringify(log.metadata)}</code></td>
        </tr>)}</tbody></table></div>}
      </div></section>
  </>;
}
