import { useEffect, useState } from "react";

import { api } from "../api";
import { Cohort, listCohorts } from "../cohorts";

function message(error: unknown) {
  return (error as { detail?: string }).detail ?? "Unable to load cohorts.";
}

export function StudentCohortsPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { void (async () => {
    try {
      setCohorts(await listCohorts());
    } catch (response) { setError(message(response)); }
    finally { setLoading(false); }
  })(); }, []);

  return <><h1>My cohorts</h1>
    {loading ? <p>Loading cohorts…</p> : error ? <p role="alert">{error}</p> : cohorts.length === 0 ? <p>No cohorts yet.</p> : <ul>{cohorts.map((cohort) => <li key={cohort.id}><a href={`/cohorts/${cohort.id}`}>{cohort.name}</a></li>)}</ul>}
  </>;
}
