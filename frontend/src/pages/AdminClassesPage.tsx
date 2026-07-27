import { FormEvent, useEffect, useState } from "react";

import { User } from "../auth";
import { Class, ClassDraft, createClass, listClasses, listTeachers, updateClass } from "../classes";

const emptyDraft: ClassDraft & { teacher_id: number | "" } = { name: "", description: "", teacher_id: "", starts_at: "", ends_at: "" };
const message = (error: unknown) => (error as { detail?: string }).detail ?? "Unable to load Classes.";
const localTime = (value: string) => value ? new Date(value).toLocaleString() : "";

const pad = (value: number) => String(value).padStart(2, "0");
export function toDateTimeLocal(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
export function toUtcIso(value: string) { return new Date(value).toISOString(); }

export function AdminClassesPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState<Class | null>(null);
  const [dialog, setDialog] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { void load(); }, [query]);
  async function load() {
    setLoading(true);
    try {
      const [next, activeTeachers] = await Promise.all([listClasses(query), listTeachers()]);
      setClasses(next); setTeachers(activeTeachers);
      const editId = Number(new URLSearchParams(location.search).get("edit"));
      const editedClass = next.find((class_) => class_.id === editId);
      if (editedClass) { history.replaceState({}, "", "/admin/classes"); open(editedClass); }
    }
    catch (response) { setError(message(response)); }
    finally { setLoading(false); }
  }
  function open(class_?: Class) {
    setEditing(class_ ?? null);
    setDraft(class_ ? { ...class_, teacher_id: class_.teacher_id, starts_at: toDateTimeLocal(class_.starts_at), ends_at: toDateTimeLocal(class_.ends_at) } : emptyDraft);
    setError(""); setDialog(true);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const payload: ClassDraft = { name: draft.name.trim(), description: draft.description.trim(), starts_at: toUtcIso(draft.starts_at), ends_at: toUtcIso(draft.ends_at) };
      if (editing) await updateClass(editing.id, payload);
      else await createClass({ ...payload, teacher_id: Number(draft.teacher_id) });
      setDialog(false); await load();
    } catch (response) { setError(message(response)); }
    finally { setSaving(false); }
  }

  return <>
    <header className="d-flex justify-content-between align-items-start gap-3 mb-4"><div><h1 className="h2 mb-1">Classes</h1><p className="text-secondary mb-0">Create Classes and manage enrollment.</p></div><button className="btn btn-primary" onClick={() => open()}>Create Class</button></header>
    <label className="form-label w-100 mb-4">Search Classes<input className="form-control" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    {error && !dialog && <div className="alert alert-danger" role="alert">{error}</div>}
    {loading ? <div className="alert alert-secondary">Loading Classes…</div> : classes.length === 0 ? <div className="alert alert-secondary">No Classes match this search.</div> : <section className="account-grid" aria-label="Classes">{classes.map((class_) => <article className="card border-0 shadow-sm" key={class_.id}><div className="card-body"><h2 className="h5">{class_.name}</h2><p className="text-secondary">{class_.description || "No description."}</p><p className="small mb-1">Teacher: {teachers.find((teacher) => teacher.id === class_.teacher_id)?.full_name || class_.teacher_id}</p><p className="small text-secondary">{localTime(class_.starts_at)} – {localTime(class_.ends_at)}</p><div className="d-flex gap-2"><button className="btn btn-outline-primary btn-sm" onClick={() => open(class_)}>Edit</button><a className="btn btn-primary btn-sm" href={`/admin/classes/${class_.id}`}>Open Class</a></div></div></article>)}</section>}
    {dialog && <dialog open className="account-dialog border-0 rounded-3 shadow" aria-labelledby="class-dialog-title"><form method="dialog" onSubmit={save}><h2 className="h4" id="class-dialog-title">{editing ? "Edit Class" : "Create Class"}</h2>{error && <div className="alert alert-danger" role="alert">{error}</div>}<label className="form-label w-100">Name<input className="form-control" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} minLength={2} maxLength={100} required /></label><label className="form-label w-100">Description<textarea className="form-control" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={1000} /></label><label className="form-label w-100">Teacher<select className="form-select" value={draft.teacher_id} disabled={!!editing} onChange={(event) => setDraft({ ...draft, teacher_id: Number(event.target.value) })} required><option value="" disabled>Choose Teacher</option>{teachers.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.full_name || teacher.email}</option>)}</select></label><label className="form-label w-100">Starts<input className="form-control" type="datetime-local" step="1" value={draft.starts_at} onChange={(event) => setDraft({ ...draft, starts_at: event.target.value })} required /></label><label className="form-label w-100">Ends<input className="form-control" type="datetime-local" step="1" value={draft.ends_at} onChange={(event) => setDraft({ ...draft, ends_at: event.target.value })} required /></label><div className="d-flex justify-content-end gap-2"><button className="btn btn-outline-secondary" type="button" disabled={saving} onClick={() => setDialog(false)}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save Class"}</button></div></form></dialog>}
  </>;
}
