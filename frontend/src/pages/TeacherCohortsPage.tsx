import { FormEvent, useEffect, useState } from "react";

import { User } from "../auth";
import { api } from "../api";
import { Cohort, createCohort, listCohorts } from "../cohorts";

function message(error: unknown) {
  return (error as { detail?: string }).detail ?? "Unable to load cohorts.";
}

export function TeacherCohortsPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { void (async () => {
    try {
      const me = await api<User>("/auth/me");
      if (me.role !== "TEACHER") throw { detail: "Teacher access is required." };
      setCohorts(await listCohorts());
    } catch (response) { setError(message(response)); }
    finally { setLoading(false); }
  })(); }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError("");
    try {
      const cohort = await createCohort({ name: String(data.get("name")), description: String(data.get("description")) });
      window.location.assign(`/cohorts/${cohort.id}`);
    } catch (response) { setError(message(response)); }
  }

  return <main><nav><a href="/teacher/cohorts">My cohorts</a></nav><h1>My cohorts</h1>
    <form onSubmit={create}><h2>Create cohort</h2>
      <label>Name <input name="name" required /></label>
      <label>Description <textarea name="description" /></label>
      <button>Create cohort</button>
    </form>
    {loading ? <p>Loading cohorts…</p> : error ? <p role="alert">{error}</p> : cohorts.length === 0 ? <p>No cohorts yet.</p> : <ul>{cohorts.map((cohort) => <li key={cohort.id}><a href={`/cohorts/${cohort.id}`}>{cohort.name}</a></li>)}</ul>}
  </main>;
}
