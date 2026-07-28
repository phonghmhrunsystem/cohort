type Submission = { id: number; version: number; original_filename: string; note: string; created_at: string };

export function SubmissionHistory({ submissions }: { submissions: Submission[] }) {
  return <section className="card border-0 shadow-sm"><div className="card-body"><h2 className="h4">My submission history</h2>{submissions.length ? <ul className="list-group list-group-flush">{submissions.map((submission) => <li className="list-group-item px-0" key={submission.id}>{submission.original_filename} · <small className="text-secondary">{new Date(submission.created_at).toLocaleString()}</small><br /><small className="text-secondary">Version {submission.version}</small>{submission.note && <p className="mb-0 mt-1">{submission.note}</p>}</li>)}</ul> : <p className="text-secondary mb-0">No submissions yet.</p>}</div></section>;
}
