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

  return <main><nav><a href="/admin/users">Accounts</a> <a href="/admin/audit-logs">Audit log</a></nav><h1>Accounts</h1>
    <form onSubmit={create}><h2>Create account</h2>
      <label>Email <input name="email" type="email" required /></label>
      <label>Password <input name="password" type="password" minLength={8} required /></label>
      <label>Role <select name="role" defaultValue="TEACHER">{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
      <button>Create account</button>
    </form>
    {loading ? <p>Loading accounts…</p> : error ? <p role="alert">{error}</p> : users.length === 0 ? <p>No accounts yet.</p> : <table><thead><tr><th>Email</th><th>Role</th><th>Active</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}>
      <td><label><span className="sr-only">Email for {user.email}</span><input value={user.email} onChange={(event) => setUsers((current) => current.map((entry) => entry.id === user.id ? { ...entry, email: event.target.value } : entry))} onBlur={() => update(user, { email: users.find((entry) => entry.id === user.id)?.email })} /></label></td>
      <td><label><span className="sr-only">Role for {user.email}</span><select value={user.role} onChange={(event) => void update(user, { role: event.target.value as Role })}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label></td>
      <td><label><input type="checkbox" checked={user.is_active} onChange={(event) => void update(user, { is_active: event.target.checked })} /> <span className="sr-only">Active for {user.email}</span></label></td>
    </tr>)}</tbody></table>}
  </main>;
}
