import { useEffect, useState } from "react";
import { Assignment, listAssignments } from "../assignments";
import { Class, ClassResource, getClass, listResources } from "../classes";
import { BackButton } from "../components/BackButton";

const classId = Number(location.pathname.split("/").pop());

export function StudentClassPage() {
  const [class_, setClass] = useState<Class>(); const [assignments, setAssignments] = useState<Assignment[]>([]); const [resources, setResources] = useState<ClassResource[]>([]); const [error, setError] = useState("");
  useEffect(() => { void Promise.all([getClass(classId), listAssignments(classId), listResources(classId)]).then(([next, coursework, links]) => { setClass(next); setAssignments(coursework); setResources(links); }).catch((response) => setError((response as { detail?: string }).detail ?? "Unable to load this Class.")); }, []);
  if (error) return <div className="alert alert-danger" role="alert">{error}</div>;
  if (!class_) return <div className="alert alert-secondary">Loading Class…</div>;
  return <><BackButton fallbackHref="/student/classes" /><h1 className="h2 mt-2">{class_.name}</h1><p>{class_.description || "No description."}</p><section className="card border-0 shadow-sm mb-4"><div className="card-body"><h2 className="h4">Giáo viên</h2><p className="mb-1">{class_.teacher.full_name || class_.teacher.email}</p><a href={`mailto:${class_.teacher.email}`}>{class_.teacher.email}</a></div></section><section className="mb-4"><h2 className="h4">Class resources</h2>{resources.length ? <ul>{resources.map((resource) => <li key={resource.id}><a href={resource.url} target="_blank" rel="noreferrer">{resource.title} (external link)</a>{resource.description && ` — ${resource.description}`}</li>)}</ul> : <p className="text-secondary">No resources yet.</p>}</section><section><h2 className="h4">Assignments</h2>{assignments.length ? <div className="account-grid">{assignments.map((assignment) => <article className="card border-0 shadow-sm" key={assignment.id}><div className="card-body"><h3 className="h5">{assignment.title}</h3><p className="small">Due {new Date(assignment.due_at).toLocaleString()}</p><a className="btn btn-primary btn-sm" href={`/student/assignments/${assignment.id}`}>Open submission</a></div></article>)}</div> : <p className="text-secondary">No assignments yet.</p>}</section></>;
}
