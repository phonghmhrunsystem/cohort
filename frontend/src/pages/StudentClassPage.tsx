import { useEffect, useState } from "react";

import { Class, getClass } from "../classes";
import { Assignment, listAssignments } from "../assignments";
import { BackButton } from "../components/BackButton";

const classId = Number(location.pathname.split("/").pop());
export function StudentClassPage() {
  const [class_, setClass] = useState<Class>(); const [assignments, setAssignments] = useState<Assignment[]>([]); const [error, setError] = useState("");
  useEffect(() => { void Promise.all([getClass(classId), listAssignments(classId)]).then(([next, coursework]) => { setClass(next); setAssignments(coursework); }).catch((response) => setError((response as { detail?: string }).detail ?? "Unable to load this Class.")); }, []);
  if (error) return <div className="alert alert-danger" role="alert">{error}</div>;
  if (!class_) return <div className="alert alert-secondary">Loading Class…</div>;
  return <><BackButton fallbackHref="/student/classes" /><h1 className="h2 mt-2">{class_.name}</h1><p>{class_.description || "No description."}</p><section><h2 className="h4">Assignments</h2>{assignments.length ? <div className="account-grid">{assignments.map((assignment) => <article className="card border-0 shadow-sm" key={assignment.id}><div className="card-body"><h3 className="h5">{assignment.title}</h3><p className="small">Due {new Date(assignment.due_at).toLocaleString()}</p><a className="btn btn-primary btn-sm" href={`/student/assignments/${assignment.id}`}>Open submission</a></div></article>)}</div> : <p className="text-secondary">No assignments yet.</p>}</section></>;
}
