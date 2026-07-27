import { FormEvent, MouseEvent, useEffect, useRef, useState } from "react";

import { ApiFailure, api } from "../api";
import { User } from "../auth";

type ManageableRole = "TEACHER" | "STUDENT";
type Gender = "NAM" | "NU" | "KHAC";
type Draft = {
  full_name: string;
  email: string;
  role: ManageableRole;
  password: string;
  phone: string;
  date_of_birth: string;
  gender: Gender | "";
  address: string;
};

const emptyDraft: Draft = {
  full_name: "",
  email: "",
  role: "TEACHER",
  password: "",
  phone: "",
  date_of_birth: "",
  gender: "",
  address: "",
};

function message(error: unknown) {
  return (error as ApiFailure).detail ?? "Unable to load accounts.";
}

function draftFor(user: User): Draft {
  return {
    full_name: user.full_name ?? "",
    email: user.email,
    role: user.role as ManageableRole,
    password: "",
    phone: user.phone ?? "",
    date_of_birth: user.date_of_birth ?? "",
    gender: user.gender ?? "",
    address: user.address ?? "",
  };
}

function accountPath(query: string, role: string) {
  return `/users?${new URLSearchParams({ q: query, role }).toString()}`;
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<ManageableRole | "">("");
  const [editing, setEditing] = useState<User | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [formFailure, setFormFailure] = useState<ApiFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      void api<User[]>(accountPath(query, role))
        .then((accounts) => { if (current) setUsers(accounts); })
        .catch((response) => { if (current) setError(message(response)); })
        .finally(() => { if (current) setLoading(false); });
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, role]);

  function openDialog(user: User | null) {
    setEditing(user);
    setDraft(user ? draftFor(user) : emptyDraft);
    setFormFailure(null);
    setDialogOpen(true);
    dialog.current?.showModal();
  }

  function closeDialog() {
    if (saving) return;
    setDialogOpen(false);
    dialog.current?.close();
  }

  function change(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormFailure(null);
    const profile = {
      full_name: draft.full_name.trim(),
      phone: draft.phone.trim(),
      date_of_birth: draft.date_of_birth || null,
      gender: draft.gender || null,
      address: draft.address.trim(),
    };
    try {
      const user = editing
        ? await api<User>(`/users/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...profile, ...(draft.password ? { new_password: draft.password } : {}) }),
          })
        : await api<User>("/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...profile, email: draft.email.trim().toLowerCase(), password: draft.password, role: draft.role }),
          });
      setUsers((current) => editing
        ? current.map((account) => account.id === user.id ? user : account)
        : [...current, user]);
      setDialogOpen(false);
      dialog.current?.close();
    } catch (response) {
      setFormFailure(response as ApiFailure);
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(user: User) {
    if (!confirm(`Deactivate ${user.full_name || user.email}?`)) return;
    setError("");
    try {
      await api<void>(`/users/${user.id}`, { method: "DELETE" });
      setUsers((current) => current.filter((account) => account.id !== user.id));
    } catch (response) {
      setError(message(response));
    }
  }

  function fieldError(field: string) {
    return formFailure?.fields?.[field]?.join(" ");
  }

  function overlayClose(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) closeDialog();
  }

  return <>
    <header className="account-header d-flex justify-content-between align-items-start gap-3 mb-4">
      <div><h1 className="h2 mb-1">Accounts</h1><p className="text-secondary mb-0">Manage active Teacher and Student accounts.</p></div>
      <button className="btn btn-primary flex-shrink-0" type="button" onClick={() => openDialog(null)}>Create account</button>
    </header>

    <div className="account-filters card border-0 shadow-sm mb-4"><div className="card-body">
      <label className="form-label w-100">Search
        <input className="form-control" aria-label="Search accounts" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or email" />
      </label>
      <label className="form-label w-100">Role
        <select className="form-select" value={role} onChange={(event) => {
          const value = event.target.value;
          setRole(value === "TEACHER" || value === "STUDENT" ? value : "");
        }}>
          <option value="">All</option><option value="TEACHER">Teacher</option><option value="STUDENT">Student</option>
        </select>
      </label>
    </div></div>

    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    {loading ? <div className="alert alert-secondary">Loading accounts…</div>
      : users.length === 0 ? <div className="alert alert-secondary">No active accounts match these filters.</div>
      : <section className="account-grid" aria-label="Active accounts">{users.map((user) =>
        <article className="card border-0 shadow-sm" key={user.id}><div className="card-body">
          <div className="d-flex justify-content-between gap-2 mb-3">
            <div className="min-w-0"><h2 className="h5 mb-1 text-break">{user.full_name || "Unnamed account"}</h2><p className="text-secondary text-break mb-0">{user.email}</p></div>
            <span className={`badge align-self-start text-bg-${user.role === "TEACHER" ? "info" : "secondary"}`}>{user.role === "TEACHER" ? "Teacher" : "Student"}</span>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => openDialog(user)}>Edit</button>
            <button className="btn btn-outline-danger btn-sm" type="button" onClick={() => void deactivate(user)}>Deactivate</button>
          </div>
        </div></article>
      )}</section>}

    <dialog ref={dialog} open={dialogOpen} className="account-dialog border-0 rounded-3 shadow" aria-labelledby="account-dialog-title" onClick={overlayClose} onClose={() => setDialogOpen(false)} onCancel={(event) => { if (saving) event.preventDefault(); }}>
      <form onSubmit={save}>
        <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
          <h2 className="h4 mb-0" id="account-dialog-title">{editing ? "Edit account" : "Create account"}</h2>
          <button className="btn-close" type="button" aria-label="Close" disabled={saving} onClick={closeDialog} />
        </div>
        {formFailure?.detail && formFailure.detail !== "Request failed." && <div className="alert alert-danger py-2" role="alert">{formFailure.detail}</div>}
        <div className="account-form-grid">
          <label className="form-label">Full name
            <input className="form-control" name="full_name" value={draft.full_name} onChange={(event) => change("full_name", event.target.value)} minLength={2} maxLength={100} required />
            {fieldError("full_name") && <span className="invalid-feedback d-block">{fieldError("full_name")}</span>}
          </label>
          <label className="form-label">Email
            <input value={editing ? editing.email : draft.email} readOnly={!!editing} className="form-control" name="email" type="email" onChange={(event) => change("email", event.target.value)} required />
            {fieldError("email") && <span className="invalid-feedback d-block">{fieldError("email")}</span>}
          </label>
          <label className="form-label">Role
            <select name="role" disabled={!!editing} className="form-select" value={editing ? editing.role : draft.role} onChange={(event) => change("role", event.target.value)}>
              <option value="TEACHER">Teacher</option><option value="STUDENT">Student</option>
            </select>
            {fieldError("role") && <span className="invalid-feedback d-block">{fieldError("role")}</span>}
          </label>
          <label className="form-label">{editing ? "New password" : "Password"}
            <input className="form-control" name={editing ? "new_password" : "password"} type="password" value={draft.password} onChange={(event) => change("password", event.target.value)} minLength={8} maxLength={128} required={!editing} autoComplete="new-password" />
            {fieldError(editing ? "new_password" : "password") && <span className="invalid-feedback d-block">{fieldError(editing ? "new_password" : "password")}</span>}
          </label>
          <label className="form-label">Phone
            <input className="form-control" name="phone" type="tel" value={draft.phone} onChange={(event) => change("phone", event.target.value)} pattern="\+?[0-9]{9,15}" />
            {fieldError("phone") && <span className="invalid-feedback d-block">{fieldError("phone")}</span>}
          </label>
          <label className="form-label">Date of birth
            <input className="form-control" name="date_of_birth" type="date" value={draft.date_of_birth} onChange={(event) => change("date_of_birth", event.target.value)} max={new Date(Date.now() - 86400000).toISOString().slice(0, 10)} />
            {fieldError("date_of_birth") && <span className="invalid-feedback d-block">{fieldError("date_of_birth")}</span>}
          </label>
          <label className="form-label">Gender
            <select className="form-select" name="gender" value={draft.gender} onChange={(event) => change("gender", event.target.value)}>
              <option value="">Not specified</option><option value="NAM">Male</option><option value="NU">Female</option><option value="KHAC">Other</option>
            </select>
            {fieldError("gender") && <span className="invalid-feedback d-block">{fieldError("gender")}</span>}
          </label>
          <label className="form-label account-address">Address
            <textarea className="form-control" name="address" value={draft.address} onChange={(event) => change("address", event.target.value)} maxLength={255} rows={2} />
            {fieldError("address") && <span className="invalid-feedback d-block">{fieldError("address")}</span>}
          </label>
        </div>
        <div className="d-flex justify-content-end gap-2 mt-3">
          <button className="btn btn-outline-secondary" type="button" disabled={saving} onClick={closeDialog}>Cancel</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create account"}</button>
        </div>
      </form>
    </dialog>
  </>;
}
