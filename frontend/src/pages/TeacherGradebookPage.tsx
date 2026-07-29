import { useEffect, useMemo, useState } from "react";

import { BackButton } from "../components/BackButton";
import { Class, Gradebook, LearningState, downloadClassGradebook, getClass, getClassGradebook } from "../classes";

const classId = () => Number(location.pathname.split("/")[3]);
const states: (LearningState | "")[] = ["", "OPEN", "SUBMITTED", "GRADED", "CLOSED"];
const errorMessage = (error: unknown) => (error as { detail?: string }).detail || "Unable to load the gradebook.";

export function TeacherGradebookPage() {
  const id = classId();
  const [class_, setClass] = useState<Class>();
  const [gradebook, setGradebook] = useState<Gradebook>();
  const [name, setName] = useState("");
  const [state, setState] = useState<LearningState | "">("");
  const [error, setError] = useState("");

  useEffect(() => { void load(); }, []);
  async function load() {
    try {
      const [nextClass, nextGradebook] = await Promise.all([getClass(id), getClassGradebook(id)]);
      setClass(nextClass); setGradebook(nextGradebook);
    } catch (response) { setError(errorMessage(response)); }
  }
  const students = useMemo(() => gradebook?.students.filter((student) =>
    `${student.full_name || ""} ${student.email}`.toLocaleLowerCase().includes(name.trim().toLocaleLowerCase()) &&
    (!state || student.grades.some((grade) => grade.learning_state === state))), [gradebook, name, state]);

  if (error && !gradebook) return <div className="alert alert-danger" role="alert">{error}</div>;
  if (!class_ || !gradebook) return <div className="alert alert-secondary">Loading gradebook…</div>;
  const filename = `${class_.name}-gradebook.csv`;
  return <>
    <BackButton fallbackHref={`/teacher/classes/${id}`} /><header className="mt-2 mb-3"><h1 className="h2">Bảng điểm: {class_.name}</h1><p className="text-secondary mb-0">Read-only learning progress for this Class.</p></header>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    <div className="d-flex flex-wrap align-items-end gap-2 mb-3"><label className="form-label mb-0">Filter students by name<input className="form-control" aria-label="Filter students by name" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="form-label mb-0">Filter by learning state<select className="form-select" aria-label="Filter by learning state" value={state} onChange={(event) => setState(event.target.value as LearningState | "")}>{states.map((value) => <option value={value} key={value || "all"}>{value || "All states"}</option>)}</select></label><a className="btn btn-outline-primary" href={`/api/classes/${id}/gradebook.csv`} download={filename} onClick={(event) => { event.preventDefault(); setError(""); void downloadClassGradebook(id, filename).catch((response: unknown) => setError(response instanceof Error ? response.message : "Unable to download this gradebook.")); }}>Download CSV</a></div>
    {!gradebook.assignments.length && <div className="alert alert-secondary">No assignments yet.</div>}
    {!gradebook.students.length && <div className="alert alert-secondary">No enrolled Students.</div>}
    {gradebook.assignments.length > 0 && gradebook.students.length > 0 && <div className="gradebook-table-wrap"><table className="table gradebook-table mb-0"><caption className="sr-only">Gradebook for {class_.name}</caption><thead><tr><th scope="col">Student</th><th scope="col">Email</th>{gradebook.assignments.map((assignment) => <th scope="col" key={assignment.id}>{assignment.title} ({assignment.maximum_score})</th>)}</tr></thead><tbody>{students?.length ? students.map((student) => <tr key={student.id}><th scope="row">{student.full_name?.trim() || student.email.split("@")[0]}</th><td>{student.email}</td>{gradebook.assignments.map((assignment) => { const grade = student.grades.find((item) => item.assignment_id === assignment.id); return <td key={assignment.id}>{grade && <>{grade.learning_state}{grade.score !== null && `: ${grade.score}`}</>}</td>; })}</tr>) : <tr><td colSpan={gradebook.assignments.length + 2} className="text-secondary">No enrolled Students match these filters.</td></tr>}</tbody></table></div>}
  </>;
}
