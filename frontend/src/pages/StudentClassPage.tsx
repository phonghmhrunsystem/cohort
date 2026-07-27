import { useEffect, useState } from "react";

import { Class, getClass } from "../classes";

const classId = Number(location.pathname.split("/").pop());
export function StudentClassPage() {
  const [class_, setClass] = useState<Class>(); const [error, setError] = useState("");
  useEffect(() => { void getClass(classId).then(setClass).catch((response) => setError((response as { detail?: string }).detail ?? "Unable to load this Class.")); }, []);
  if (error) return <div className="alert alert-danger" role="alert">{error}</div>;
  if (!class_) return <div className="alert alert-secondary">Loading Class…</div>;
  return <><a href="/student/classes">My Classes</a><h1 className="h2 mt-2">{class_.name}</h1><p>{class_.description || "No description."}</p></>;
}
