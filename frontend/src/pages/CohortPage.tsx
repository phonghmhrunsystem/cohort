import { FormEvent, useEffect, useState } from "react";

import { User } from "../auth";
import { api } from "../api";
import { Cohort, enrollStudent, getCohort, listStudentAccounts, updateCohort } from "../cohorts";

function message(error: unknown) {
  return (error as { detail?: string }).detail ?? "Unable to load this cohort.";
}

const cohortId = Number(location.pathname.split("/").pop());

export function CohortPage() {
  const [cohort, setCohort] = useState<Cohort>();
  const [students, setStudents] = useState<User[]>([]);
  const [role, setRole] = useState<User["role"]>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { void (async () => {
    try {
      const me = await api<User>("/auth/me");
      const next = await getCohort(cohortId);
      setRole(me.role);
      setCohort(next);
      if (me.role === "TEACHER") setStudents(await listStudentAccounts());
    } catch (response) { setError(message(response)); }
    finally { setLoading(false); }
  })(); }, []);

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try { setCohort(await updateCohort(cohortId, { name: String(data.get("name")), description: String(data.get("description")) })); }
    catch (response) { setError(message(response)); }
  }

  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await enrollStudent(cohortId, Number(data.get("student_id")));
      event.currentTarget.reset();
    } catch (response) { setError(message(response)); }
  }

  if (loading) return <main><p>Loading cohort…</p></main>;
  if (error || !cohort) return <main><p role="alert">{error || "Unable to load this cohort."}</p></main>;

  return <main><nav><a href={role === "TEACHER" ? "/teacher/cohorts" : "/student/cohorts"}>My cohorts</a></nav><h1>{cohort.name}</h1>
    {role === "TEACHER" ? <><form onSubmit={update}><h2>Edit cohort</h2>
      <label>Name <input name="name" defaultValue={cohort.name} required /></label>
      <label>Description <textarea name="description" defaultValue={cohort.description} /></label>
      <button>Save changes</button>
    </form><form onSubmit={enroll}><h2>Enroll Student</h2>
      <label>Student <select name="student_id" defaultValue="" required><option value="" disabled>Select a Student</option>{students.map((student) => <option value={student.id} key={student.id}>{student.email}</option>)}</select></label>
      <button>Enroll Student</button>
    </form></> : <p>{cohort.description || "No description."}</p>}
    {error && <p role="alert">{error}</p>}
  </main>;
}
