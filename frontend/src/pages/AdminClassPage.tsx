import { FormEvent, useEffect, useRef, useState } from "react";

import { displayName } from "../auth";
import { Class, Student, getClass, listClassStudents, listEnrolledStudents, replaceEnrollment } from "../classes";
import { AppDialog } from "../components/AppDialog";

const classId = Number(location.pathname.split("/").pop());
const message = (error: unknown) => (error as { detail?: string }).detail ?? "Unable to load this Class.";

export function AdminClassPage() {
  const [class_, setClass] = useState<Class>();
  const [students, setStudents] = useState<Student[]>([]);
  const [candidates, setCandidates] = useState<Student[]>([]);
  const [query, setQuery] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [studentIds, setStudentIds] = useState<number[]>([]);
  const [dialog, setDialog] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [rosterLoading, setRosterLoading] = useState(false);
  const studentsHeading = useRef<HTMLHeadingElement>(null);
  const rosterRequest = useRef(0);

  useEffect(() => { void load(); }, [query]);
  async function load() {
    try { const [next, roster] = await Promise.all([getClass(classId), listEnrolledStudents(classId, query)]); setClass(next); setStudents(roster); }
    catch (response) { setError(message(response)); }
  }
  async function searchStudents(value: string) {
    const request = ++rosterRequest.current;
    setStudentQuery(value);
    try {
      const next = await listClassStudents(classId, value);
      if (request === rosterRequest.current) setCandidates(next);
    } catch (response) {
      if (request === rosterRequest.current) setError(message(response));
    }
  }
  async function openRoster() {
    const request = ++rosterRequest.current;
    setError("");
    setDialog(true);
    setRosterLoading(true);
    try {
      const [roster, candidates] = await Promise.all([listEnrolledStudents(classId), listClassStudents(classId)]);
      if (request !== rosterRequest.current) return;
      setStudentIds(roster.map((student) => student.id)); setStudentQuery(""); setCandidates(candidates);
      setRosterLoading(false);
    } catch (response) {
      if (request === rosterRequest.current) setError(message(response));
    }
  }
  function closeRoster() {
    ++rosterRequest.current;
    setDialog(false); setStudentIds([]); setStudentQuery(""); setCandidates([]); setRosterLoading(false); setSaving(false);
  }
  function toggleStudent(id: number) {
    setStudentIds((ids) => ids.includes(id) ? ids.filter((studentId) => studentId !== id) : [...ids, id]);
  }
  async function saveRoster(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rosterLoading) return;
    const request = ++rosterRequest.current;
    setSaving(true); setError("");
    try {
      const next = await replaceEnrollment(classId, studentIds);
      if (request !== rosterRequest.current) return;
      setStudents(next); closeRoster();
    } catch (response) {
      if (request === rosterRequest.current) setError(message(response));
    } finally {
      if (request === rosterRequest.current) setSaving(false);
    }
  }
  if (error && !class_) return <div className="alert alert-danger" role="alert">{error}</div>;
  if (!class_) return <div className="alert alert-secondary">Loading Class…</div>;
  return <><header className="d-flex justify-content-between gap-3 mb-4"><div><a href="/admin/classes">Classes</a><h1 className="h2 mt-2">{class_.name}</h1><p className="text-secondary">{class_.description || "No description."}</p></div><a className="btn btn-outline-primary align-self-start" href={`/admin/classes?edit=${class_.id}`}>Edit Class</a></header>{error && <div className="alert alert-danger" role="alert">{error}</div>}<section className="card border-0 shadow-sm"><div className="card-body"><div className="d-flex justify-content-between gap-3 mb-3"><h2 ref={studentsHeading} tabIndex={-1} className="h4 mb-0">Students</h2><button className="btn btn-primary btn-sm" onClick={openRoster}>Edit roster</button></div><label className="form-label w-100">Search enrolled Students<input className="form-control" value={query} onChange={(event) => setQuery(event.target.value)} /></label>{students.length === 0 ? <p className="text-secondary mb-0">No enrolled Students match this search.</p> : <ul className="list-group list-group-flush">{students.map((student) => <li className="list-group-item" key={student.id}>{displayName(student)}</li>)}</ul>}</div></section><AppDialog open={dialog} title="Edit roster" pending={saving} fallbackFocus={studentsHeading} onClose={closeRoster}><form onSubmit={saveRoster}>{error && <div className="alert alert-danger" role="alert">{error}</div>}<label className="form-label w-100">Search Students<input className="form-control" type="search" value={studentQuery} disabled={rosterLoading || saving} onChange={(event) => void searchStudents(event.target.value)} /></label><div className="list-group">{candidates.map((student) => <label className="list-group-item" key={student.id}><input className="form-check-input me-2" type="checkbox" value={student.id} checked={studentIds.includes(student.id)} onChange={() => toggleStudent(student.id)} />{displayName(student)}</label>)}</div><button className="btn btn-primary mt-3" disabled={saving || rosterLoading}>{saving ? "Saving…" : "Save roster"}</button></form></AppDialog></>;
}
