import { FormEvent, useEffect, useRef, useState } from "react";

import { displayName, User } from "../auth";
import { Class, enrollStudent, getClass, listClassStudents, listStudentAccounts, removeStudent } from "../classes";
import { AppDialog } from "../components/AppDialog";

const classId = Number(location.pathname.split("/").pop());
const message = (error: unknown) => (error as { detail?: string }).detail ?? "Unable to load this Class.";

export function AdminClassPage() {
  const [class_, setClass] = useState<Class>();
  const [students, setStudents] = useState<Pick<User, "id" | "full_name" | "email">[]>([]);
  const [choices, setChoices] = useState<User[]>([]);
  const [query, setQuery] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [studentId, setStudentId] = useState("");
  const [dialog, setDialog] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Pick<User, "id" | "full_name" | "email"> | null>(null);
  const [removingSaving, setRemovingSaving] = useState(false);
  const studentsHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { void load(); }, [query]);
  async function load() {
    try { const [next, roster] = await Promise.all([getClass(classId), listClassStudents(classId, query)]); setClass(next); setStudents(roster); }
    catch (response) { setError(message(response)); }
  }
  async function searchStudents(value = studentQuery) {
    setStudentQuery(value);
    try { setChoices(await listStudentAccounts(value)); } catch (response) { setError(message(response)); }
  }
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try { await enrollStudent(classId, Number(studentId)); setDialog(false); setStudentId(""); await load(); }
    catch (response) { setError(message(response)); } finally { setSaving(false); }
  }
  async function remove() {
    if (!removing) return;
    setRemovingSaving(true); setError("");
    try { await removeStudent(classId, removing.id); await load(); setRemoving(null); }
    catch (response) { setError(message(response)); } finally { setRemovingSaving(false); }
  }
  if (error && !class_) return <div className="alert alert-danger" role="alert">{error}</div>;
  if (!class_) return <div className="alert alert-secondary">Loading Class…</div>;
  return <><header className="d-flex justify-content-between gap-3 mb-4"><div><a href="/admin/classes">Classes</a><h1 className="h2 mt-2">{class_.name}</h1><p className="text-secondary">{class_.description || "No description."}</p></div><a className="btn btn-outline-primary align-self-start" href={`/admin/classes?edit=${class_.id}`}>Edit Class</a></header>{error && <div className="alert alert-danger" role="alert">{error}</div>}<section className="card border-0 shadow-sm"><div className="card-body"><div className="d-flex justify-content-between gap-3 mb-3"><h2 ref={studentsHeading} tabIndex={-1} className="h4 mb-0">Students</h2><button className="btn btn-primary btn-sm" onClick={() => { setDialog(true); void searchStudents(""); }}>Add Student</button></div><label className="form-label w-100">Search enrolled Students<input className="form-control" value={query} onChange={(event) => setQuery(event.target.value)} /></label>{students.length === 0 ? <p className="text-secondary mb-0">No enrolled Students match this search.</p> : <ul className="list-group list-group-flush">{students.map((student) => <li className="list-group-item d-flex justify-content-between align-items-center gap-2" key={student.id}><span>{displayName(student)}</span><button className="btn btn-outline-danger btn-sm" onClick={() => setRemoving(student)}>Remove Student</button></li>)}</ul>}</div></section><AppDialog open={dialog} title="Add Student" pending={saving} onClose={() => setDialog(false)}><form onSubmit={add}><label className="form-label w-100">Search Students<input className="form-control" value={studentQuery} onChange={(event) => void searchStudents(event.target.value)} /></label><label className="form-label w-100">Student<select className="form-select" value={studentId} onChange={(event) => setStudentId(event.target.value)} required><option value="" disabled>Choose Student</option>{choices.map((student) => <option value={student.id} key={student.id}>{displayName(student)}</option>)}</select></label><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Add Student"}</button></form></AppDialog><AppDialog open={!!removing} title={removing ? `Gỡ ${displayName(removing)}` : "Gỡ"} pending={removingSaving} fallbackFocus={studentsHeading} onClose={() => setRemoving(null)}><p>Bạn có chắc muốn gỡ học sinh này?</p>{error && <div className="alert alert-danger" role="alert">{error}</div>}<button className="btn btn-danger" type="button" disabled={removingSaving} onClick={() => void remove()}>Gỡ</button></AppDialog></>;
}
