import { FormEvent, useEffect, useRef, useState } from "react";

import { Assignment, AssignmentDraft, RubricCriterion, createAssignment, listAssignments, replaceRubric, updateAssignment } from "../assignments";
import { displayName } from "../auth";
import { Class, getClass, listEnrolledStudents } from "../classes";
import { AppDialog } from "../components/AppDialog";
import { BackButton } from "../components/BackButton";

type Tab = "students" | "assignments";
const classId = () => Number(location.pathname.split("/").pop());
const emptyDraft: AssignmentDraft = { title: "", description: "", due_at: "" };
export const normalizeTeacherClassTab = (tab: string | null): Tab => tab === "assignments" ? "assignments" : "students";
const message = (error: unknown) => {
  const failure = error as { detail?: string; fields?: Record<string, string[]> };
  return Object.values(failure.fields ?? {}).flat().join(" ") || failure.detail || "Unable to save coursework.";
};
const pad = (value: number) => String(value).padStart(2, "0");
const milliseconds = (value: number) => String(value).padStart(3, "0");
export const toLocalDateTime = (value: string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${milliseconds(date.getMilliseconds())}`;
};
export const toUtcIso = (value: string) => new Date(value).toISOString();

export function TeacherClassPage() {
  const id = classId();
  const [class_, setClass] = useState<Class>();
  const [students, setStudents] = useState<{ id: number; full_name: string | null; email: string }[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [tab, setTab] = useState<Tab>(() => normalizeTeacherClassTab(new URLSearchParams(location.search).get("tab")));
  const [studentQuery, setStudentQuery] = useState("");
  const [draft, setDraft] = useState<AssignmentDraft>(emptyDraft);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [rubricFor, setRubricFor] = useState<Assignment | null>(null);
  const [criteria, setCriteria] = useState<RubricCriterion[]>([]);
  const [dialog, setDialog] = useState<"assignment" | "rubric" | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingCriterion, setRemovingCriterion] = useState<RubricCriterion | null>(null);
  const addCriterionButton = useRef<HTMLButtonElement>(null);

  useEffect(() => { void load(); }, [studentQuery]);
  async function load() {
    try {
      const [next, roster, coursework] = await Promise.all([getClass(id), listEnrolledStudents(id, studentQuery), listAssignments(id)]);
      setClass(next); setStudents(roster); setAssignments(coursework);
    } catch (response) { setError(message(response)); }
  }
  function selectTab(next: Tab) {
    setTab(next);
    history.replaceState({}, "", `${location.pathname}?tab=${next}`);
  }
  function openAssignment(assignment?: Assignment) {
    setEditing(assignment ?? null);
    setDraft(assignment ? { title: assignment.title, description: assignment.description, due_at: toLocalDateTime(assignment.due_at) } : emptyDraft);
    setError(""); setDialog("assignment");
  }
  function openRubric(assignment: Assignment) {
    setRubricFor(assignment); setCriteria(assignment.criteria.map(({ id, title, maximum_score }) => ({ id, title, maximum_score })));
    setError(""); setDialog("rubric");
  }
  async function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const value = { ...draft, title: draft.title.trim(), description: draft.description.trim(), due_at: toUtcIso(draft.due_at) };
      if (editing) await updateAssignment(editing.id, value); else await createAssignment(id, value);
      setDialog(null); await load();
    } catch (response) { setError(message(response)); } finally { setSaving(false); }
  }
  async function saveRubric(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rubricFor || criteria.reduce((total, criterion) => total + Number(criterion.maximum_score), 0) !== 100) return;
    setSaving(true); setError("");
    try { await replaceRubric(rubricFor.id, criteria.map(({ title, maximum_score }) => ({ title: title.trim(), maximum_score: Number(maximum_score) }))); setDialog(null); await load(); }
    catch (response) { setError(message(response)); } finally { setSaving(false); }
  }
  function removeCriterion() {
    if (!removingCriterion) return;
    setCriteria(criteria.filter((criterion) => criterion !== removingCriterion));
    setRemovingCriterion(null);
  }
  if (error && !class_) return <div className="alert alert-danger" role="alert">{error}</div>;
  if (!class_) return <div className="alert alert-secondary">Loading Class…</div>;
  const total = criteria.reduce((sum, criterion) => sum + Number(criterion.maximum_score || 0), 0);
  return <>
    <BackButton fallbackHref="/teacher/classes" /><header className="mt-2 mb-3"><h1 className="h2">{class_.name}</h1><p className="text-secondary mb-0">{class_.description || "No description."}</p></header>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    <div className="teacher-tabs mb-3" role="tablist" aria-label="Class content"><button className={`btn ${tab === "students" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => selectTab("students")} type="button">Students</button><button className={`btn ${tab === "assignments" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => selectTab("assignments")} type="button">Assignments</button></div>
    {tab === "students" ? <section className="card border-0 shadow-sm"><div className="card-body"><h2 className="h4">Students</h2><label className="form-label w-100">Search enrolled Students<input className="form-control" value={studentQuery} onChange={(event) => setStudentQuery(event.target.value)} /></label>{students.length ? <ul className="list-group list-group-flush">{students.map((student) => <li className="list-group-item" key={student.id}>{displayName(student)}</li>)}</ul> : <p className="text-secondary mb-0">No enrolled Students match this search.</p>}</div></section> : <section><div className="d-flex justify-content-between align-items-center gap-3 mb-3"><h2 className="h4 mb-0">Assignments</h2><button className="btn btn-primary" onClick={() => openAssignment()}>Create Assignment</button></div>{assignments.length ? <div className="account-grid">{assignments.map((assignment) => <article className="card border-0 shadow-sm" key={assignment.id}><div className="card-body"><h3 className="h5">{assignment.title}</h3><p className="text-secondary">{assignment.description}</p><p className="small">Due {new Date(assignment.due_at).toLocaleString()}</p><div className="d-flex gap-2"><button className="btn btn-outline-primary btn-sm" onClick={() => openAssignment(assignment)}>Edit</button><button className="btn btn-outline-primary btn-sm" onClick={() => openRubric(assignment)}>Edit rubric</button><a className="btn btn-outline-primary btn-sm" href={`/teacher/assignments/${assignment.id}`}>View submissions</a></div></div></article>)}</div> : <div className="alert alert-secondary">No assignments yet.</div>}</section>}
    <AppDialog open={dialog === "assignment"} title={editing ? "Edit Assignment" : "Create Assignment"} pending={saving} onClose={() => setDialog(null)}><form onSubmit={saveAssignment}>{error && <div className="alert alert-danger" role="alert">{error}</div>}<label className="form-label w-100">Title<input className="form-control" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} minLength={2} maxLength={150} required /></label><label className="form-label w-100">Description<textarea className="form-control" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} minLength={10} maxLength={5000} required /></label><label className="form-label w-100">Due date<input className="form-control" type="datetime-local" step="0.001" value={draft.due_at} onChange={(event) => setDraft({ ...draft, due_at: event.target.value })} required /></label><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save Assignment"}</button></form></AppDialog>
    <AppDialog open={dialog === "rubric"} title="Edit rubric" pending={saving} onClose={() => setDialog(null)}><form onSubmit={saveRubric}>{error && <div className="alert alert-danger" role="alert">{error}</div>}<p className={total === 100 ? "text-success" : "text-danger"}>Total: {total} / 100</p>{criteria.map((criterion, index) => <div className="account-form-grid mb-2" key={criterion.id ?? index}><label className="form-label">Criterion<input className="form-control" value={criterion.title} onChange={(event) => setCriteria(criteria.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} required /></label><label className="form-label">Points<input className="form-control" type="number" min="1" max="100" value={criterion.maximum_score} onChange={(event) => setCriteria(criteria.map((item, i) => i === index ? { ...item, maximum_score: Number(event.target.value) } : item))} required /></label><button className="btn btn-outline-danger btn-sm align-self-end" type="button" aria-label={`Xóa ${criterion.title.trim() || `tiêu chí ${index + 1}`}`} onClick={() => setRemovingCriterion(criterion)}>Xóa</button></div>)}<button ref={addCriterionButton} className="btn btn-outline-primary btn-sm mb-3" type="button" onClick={() => setCriteria([...criteria, { title: "", maximum_score: 1 }])}>Add criterion</button><button className="btn btn-primary" disabled={saving || total !== 100}>Save rubric</button></form></AppDialog>
    <AppDialog open={!!removingCriterion} title={removingCriterion ? `Xóa ${removingCriterion.title.trim() || `tiêu chí ${criteria.indexOf(removingCriterion) + 1}`}` : "Xóa"} fallbackFocus={addCriterionButton} onClose={() => setRemovingCriterion(null)}><p>Bạn có chắc muốn xóa tiêu chí này?</p><button className="btn btn-danger" type="button" onClick={removeCriterion}>Xóa</button></AppDialog>
  </>;
}
