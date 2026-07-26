import { FormEvent, useEffect, useState } from "react";

import { Role, User } from "../auth";
import { api } from "../api";

const roles: Role[] = ["ADMIN", "TEACHER", "STUDENT"];

function message(error: unknown) {
  return (error as { detail?: string }).detail ?? "Unable to load accounts.";
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const me = await api<User>("/auth/me");
      if (me.role !== "ADMIN") throw { detail: "Admin access is required." };
      setUsers(await api<User[]>("/users"));
    } catch (response) {
      setError(message(response));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const user = await api<User>("/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email"), password: data.get("password"), role: data.get("role"), is_active: true }) });
      setUsers((current) => [...current, user]);
      form.reset();
    } catch (response) { setError(message(response)); }
  }

  async function update(user: User, changes: Partial<User>) {
    try {
      const next = await api<User>(`/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
      setUsers((current) => current.map((entry) => entry.id === next.id ? next : entry));
    } catch (response) { setError(message(response)); }
  }

  return <div className="workspace">
    <aside className="workspace-sidebar p-3">
      <a className="text-white text-decoration-none fw-semibold d-block mb-4" href="/admin/users">Class Management</a>
      <nav className="workspace-nav nav nav-pills flex-column gap-1" aria-label="Admin navigation">
        <a className="nav-link" href="/admin/users" aria-current="page">Accounts</a>
        <a className="nav-link" href="/admin/audit-logs">Audit log</a>
      </nav>
    </aside>
    <main className="workspace-content p-3 p-lg-4">
      <div className="d-flex justify-content-between align-items-center mb-4"><div><h1 className="h2 mb-1">Accounts</h1><p className="text-secondary mb-0">Manage administrator, teacher, and student accounts.</p></div></div>
      <section className="card shadow-sm border-0 mb-4"><div className="card-body">
        <h2 className="h4 mb-3">Create account</h2>
        <form onSubmit={create} className="row g-3 align-items-end">
          <label className="col-md-4">Email <input className="form-control" name="email" type="email" required /></label>
          <label className="col-md-3">Password <input className="form-control" name="password" type="password" minLength={8} required /></label>
          <label className="col-md-3">Role <select className="form-select" name="role" defaultValue="TEACHER">{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
          <div className="col-md-2"><button className="btn btn-primary w-100">Create account</button></div>
        </form>
      </div></section>
      <section className="card shadow-sm border-0"><div className="card-body p-0">
        {loading ? <div className="alert alert-secondary mb-0">Loading accounts…</div> : error ? <div className="alert alert-danger mb-0" role="alert">{error}</div> : users.length === 0 ? <div className="alert alert-secondary mb-0">No accounts yet.</div> : <div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead className="table-light"><tr><th>Email</th><th>Role</th><th>Active</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}>
          <td><label><span className="sr-only">Email for {user.email}</span><input className="form-control" value={user.email} onChange={(event) => setUsers((current) => current.map((entry) => entry.id === user.id ? { ...entry, email: event.target.value } : entry))} onBlur={() => update(user, { email: users.find((entry) => entry.id === user.id)?.email })} /></label></td>
          <td><div className="d-flex align-items-center gap-2"><label><span className="sr-only">Role for {user.email}</span><select className="form-select" value={user.role} onChange={(event) => void update(user, { role: event.target.value as Role })}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label><span className={`badge text-bg-${user.role === "ADMIN" ? "primary" : user.role === "TEACHER" ? "info" : "secondary"}`}>{user.role}</span></div></td>
          <td><div className="d-flex align-items-center gap-2"><span className={`badge text-bg-${user.is_active ? "success" : "secondary"}`}>{user.is_active ? "Active" : "Inactive"}</span><label><input className="form-check-input" type="checkbox" checked={user.is_active} onChange={(event) => void update(user, { is_active: event.target.checked })} /> <span className="sr-only">Active for {user.email}</span></label></div></td>
        </tr>)}</tbody></table></div>}
      </div></section>
    </main>
  </div>;
}
