import { useEffect, useState } from "react";

import { Class, listClasses } from "../classes";

export function StudentClassesPage() {
  const [classes, setClasses] = useState<Class[]>([]); const [error, setError] = useState("");
  useEffect(() => { void listClasses().then(setClasses).catch((response) => setError((response as { detail?: string }).detail ?? "Unable to load Classes.")); }, []);
  return <><h1 className="h2">My Classes</h1>{error ? <div className="alert alert-danger" role="alert">{error}</div> : classes.length === 0 ? <div className="alert alert-secondary">No enrolled Classes.</div> : <section className="account-grid">{classes.map((class_) => <article className="card border-0 shadow-sm" key={class_.id}><div className="card-body"><h2 className="h5">{class_.name}</h2><p className="text-secondary">{class_.description || "No description."}</p><a className="btn btn-primary btn-sm" href={`/student/classes/${class_.id}`}>Open Class</a></div></article>)}</section>}</>;
}
