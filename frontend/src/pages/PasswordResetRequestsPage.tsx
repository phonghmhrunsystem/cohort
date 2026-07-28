import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";

type Request = { id: number; email: string; requested_at: string };
export function PasswordResetRequestsPage() {
  const [rows, setRows] = useState<Request[]>([]); const [error, setError] = useState("");
  useEffect(() => { void api<Request[]>("/password-reset-requests").then(setRows).catch((e) => setError(e.detail || "Unable to load requests.")); }, []);
  async function resolve(event: FormEvent<HTMLFormElement>, id: number) { event.preventDefault(); const password = String(new FormData(event.currentTarget).get("password")); try { await api<void>(`/password-reset-requests/${id}/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); setRows((current) => current.filter((row) => row.id !== id)); } catch (e) { setError((e as { detail?: string }).detail || "Unable to resolve request."); } }
  return <section><h1 className="h2 mb-3">Password reset requests</h1>{error && <p className="alert alert-danger">{error}</p>}{rows.length ? <ul className="list-group">{rows.map((row) => <li className="list-group-item" key={row.id}><strong>{row.email}</strong><form className="d-flex gap-2 mt-2" onSubmit={(event) => void resolve(event, row.id)}><input className="form-control" name="password" type="password" minLength={8} maxLength={128} placeholder="Temporary password" required /><button className="btn btn-primary">Resolve</button></form></li>)}</ul> : <p className="text-secondary">No pending requests.</p>}</section>;
}
