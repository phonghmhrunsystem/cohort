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

const sensitive = ["password", "hash", "token", "secret", "authorization", "jwt", "access", "refresh", "file", "path", "storage", "upload", "content", "bytes", "blob", "data"];
const omitted = Symbol("omitted");

function safeValue(value: unknown, key = ""): unknown | typeof omitted {
  if (sensitive.some((word) => key.toLowerCase().includes(word))) return omitted;
  if (typeof value === "string" && (/^(?:[a-z]:[\\/]|\/)/i.test(value) || value.includes("\\") || value.includes("/"))) return omitted;
  if (Array.isArray(value)) return value.map((item) => safeValue(item)).filter((item) => item !== omitted);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).flatMap(([childKey, item]) => {
      const clean = safeValue(item, childKey);
      return clean === omitted ? [] : [[childKey, clean]];
    }));
  }
  return value;
}

function displayMetadata(metadata: Record<string, unknown>) {
  return JSON.stringify(safeValue(metadata));
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
