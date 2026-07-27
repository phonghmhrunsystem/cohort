import { FormEvent, useEffect, useState } from "react";

import { User } from "../auth";
import { Class, enrollStudent, getClass, listClassStudents, listStudentAccounts, removeStudent } from "../classes";

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
    try { await enrollStudent(classId, Number(studentId)); setDialog(false); setStudentId(""); await load(); }
    catch (response) { setError(message(response)); }
  }
  async function remove(student: Pick<User, "id" | "full_name" | "email">) {
    try { await removeStudent(classId, student.id); await load(); }
    catch (response) { setError(message(response)); }
  }
  if (error && !class_) return <div className="alert alert-danger" role="alert">{error}</div>;
  if (!class_) return <div className="alert alert-secondary">Loading Class…</div>;
  return <><header className="d-flex justify-content-between gap-3 mb-4"><div><a href="/admin/classes">Classes</a><h1 className="h2 mt-2">{class_.name}</h1><p className="text-secondary">{class_.description || "No description."}</p></div><a className="btn btn-outline-primary align-self-start" href="/admin/classes">Edit Class</a></header>{error && <div className="alert alert-danger" role="alert">{error}</div>}<section className="card border-0 shadow-sm"><div className="card-body"><div className="d-flex justify-content-between gap-3 mb-3"><h2 className="h4 mb-0">Students</h2><button className="btn btn-primary btn-sm" onClick={() => { setDialog(true); void searchStudents(""); }}>Add Student</button></div><label className="form-label w-100">Search enrolled Students<input className="form-control" value={query} onChange={(event) => setQuery(event.target.value)} /></label>{students.length === 0 ? <p className="text-secondary mb-0">No enrolled Students match this search.</p> : <ul className="list-group list-group-flush">{students.map((student) => <li className="list-group-item d-flex justify-content-between align-items-center gap-2" key={student.id}><span>{student.full_name || student.email}</span><button className="btn btn-outline-danger btn-sm" onClick={() => void remove(student)}>Remove Student</button></li>)}</ul>}</div></section>{dialog && <dialog open className="account-dialog border-0 rounded-3 shadow"><form method="dialog" onSubmit={add}><h2 className="h4">Add Student</h2><label className="form-label w-100">Search Students<input className="form-control" value={studentQuery} onChange={(event) => void searchStudents(event.target.value)} /></label><label className="form-label w-100">Student<select className="form-select" value={studentId} onChange={(event) => setStudentId(event.target.value)} required><option value="" disabled>Choose Student</option>{choices.map((student) => <option value={student.id} key={student.id}>{student.full_name || student.email}</option>)}</select></label><div className="d-flex justify-content-end gap-2"><button className="btn btn-outline-secondary" type="button" onClick={() => setDialog(false)}>Cancel</button><button className="btn btn-primary">Add Student</button></div></form></dialog>}</>;
}
