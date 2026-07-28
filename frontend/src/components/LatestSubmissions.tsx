import { useState } from "react";

import { accessToken } from "../session";

type Submission = { id: number; student_id: number; version: number; original_filename: string; created_at: string };

export async function downloadSubmission(id: number, filename: string) {
  const response = await fetch(`/api/submissions/${id}/download`, { headers: { Authorization: `Bearer ${accessToken()}` } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail || "Unable to download this submission.");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

export function LatestSubmissions({ submissions }: { submissions: Submission[] }) {
  const [error, setError] = useState("");
  return <section className="card border-0 shadow-sm"><div className="card-body"><h2 className="h4">Latest submissions</h2>{error && <div className="alert alert-danger" role="alert">{error}</div>}{submissions.length ? <ul className="list-group list-group-flush">{submissions.map((submission) => <li className="list-group-item px-0 d-flex justify-content-between align-items-center gap-2" key={submission.id}><span>Student #{submission.student_id} · Version {submission.version}<br /><small className="text-secondary">{new Date(submission.created_at).toLocaleString()}</small></span><a href={`/api/submissions/${submission.id}/download`} onClick={(event) => { event.preventDefault(); setError(""); void downloadSubmission(submission.id, submission.original_filename).catch((response: unknown) => setError(response instanceof Error ? response.message : "Unable to download this submission.")); }}>Download {submission.original_filename}</a></li>)}</ul> : <p className="text-secondary mb-0">No submissions yet.</p>}</div></section>;
}
