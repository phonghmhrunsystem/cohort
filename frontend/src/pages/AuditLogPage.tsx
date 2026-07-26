import { useEffect, useState } from "react";

import { User } from "../auth";
import { api } from "../api";

type AuditLog = { id: number; actor_id: number | null; action: string; target_type: string; target_id: number; metadata: Record<string, unknown>; created_at: string };

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { void (async () => {
    try {
      const me = await api<User>("/auth/me");
      if (me.role !== "ADMIN") throw { detail: "Admin access is required." };
      setLogs(await api<AuditLog[]>("/audit-logs"));
    } catch (response) { setError((response as { detail?: string }).detail ?? "Unable to load audit logs."); }
    finally { setLoading(false); }
  })(); }, []);

  return <main><nav><a href="/admin/users">Accounts</a> <a href="/admin/audit-logs">Audit log</a></nav><h1>Audit log</h1>
    {loading ? <p>Loading audit log…</p> : error ? <p role="alert">{error}</p> : logs.length === 0 ? <p>No audit entries yet.</p> : <table><thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Target</th><th>Details</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{new Date(log.created_at).toLocaleString()}</td><td>{log.action}</td><td>{log.actor_id ?? "System"}</td><td>{log.target_type} #{log.target_id}</td><td>{JSON.stringify(log.metadata)}</td></tr>)}</tbody></table>}
  </main>;
}
