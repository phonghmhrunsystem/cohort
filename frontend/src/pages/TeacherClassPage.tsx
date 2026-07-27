import { useEffect, useState } from "react";

import { Class, getClass, listClassStudents } from "../classes";

const classId = Number(location.pathname.split("/").pop());
export function TeacherClassPage() {
  const [class_, setClass] = useState<Class>(); const [students, setStudents] = useState<{ id: number; full_name: string | null; email: string }[]>([]); const [error, setError] = useState("");
  useEffect(() => { void Promise.all([getClass(classId), listClassStudents(classId)]).then(([next, roster]) => { setClass(next); setStudents(roster); }).catch((response) => setError((response as { detail?: string }).detail ?? "Unable to load this Class.")); }, []);
  if (error) return <div className="alert alert-danger" role="alert">{error}</div>;
  if (!class_) return <div className="alert alert-secondary">Loading Class…</div>;
  return <><a href="/teacher/classes">My Classes</a><h1 className="h2 mt-2">{class_.name}</h1><h2 className="h4">Students</h2>{students.length ? <ul className="list-group">{students.map((student) => <li className="list-group-item" key={student.id}>{student.full_name || student.email}</li>)}</ul> : <p className="text-secondary">No enrolled Students.</p>}</>;
}
