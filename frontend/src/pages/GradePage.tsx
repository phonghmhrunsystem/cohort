import { FormEvent, useEffect, useState } from "react";

import { Assignment, getAssignment } from "../assignments";
import { Grade, submitGrade } from "../grading";

const message = (error: unknown) => {
  const failure = error as { detail?: string; fields?: Record<string, string[]> };
  return Object.values(failure.fields ?? {}).flat().join(" ") || failure.detail || "Unable to save this grade.";
};

export function GradePage({ assignmentId, submissionId }: { assignmentId: number; submissionId: number }) {
  const [assignment, setAssignment] = useState<Assignment>();
  const [scores, setScores] = useState<Record<number, number>>({});
  const [total, setTotal] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getAssignment(assignmentId).then((next) => {
      setAssignment(next);
      setScores(Object.fromEntries(next.criteria.map((criterion) => [criterion.id!, 0])));
    }).catch((response) => setError(message(response)));
  }, [assignmentId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignment || !feedback.trim()) return;
    setSaving(true); setError("");
    try {
      const payload = assignment.criteria.length
        ? { feedback: feedback.trim(), scores: assignment.criteria.map((criterion) => ({ criterion_id: criterion.id!, score: Number(scores[criterion.id!] ?? 0) })) }
        : { feedback: feedback.trim(), total_score: Number(total) };
      setGrade(await submitGrade(submissionId, payload));
    } catch (response) { setError(message(response)); } finally { setSaving(false); }
  }

  return <>
    <a href={`/teacher/assignments/${assignmentId}`}>Back to submissions</a>
    <h1 className="h2 mt-2">Grade submission</h1>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    {!assignment ? <div className="alert alert-secondary">Loading…</div> : grade ? <div className="alert alert-success" role="status">Saved. Total score: {grade.total_score}. Feedback: {grade.feedback}</div> : <section className="card border-0 shadow-sm"><div className="card-body">
      <form onSubmit={submit}>
        {assignment.criteria.length ? assignment.criteria.map((criterion) => <label className="form-label w-100" key={criterion.id}>{criterion.title} (0-{criterion.maximum_score})<input className="form-control" type="number" min={0} max={criterion.maximum_score} value={scores[criterion.id!] ?? 0} onChange={(event) => setScores({ ...scores, [criterion.id!]: Number(event.target.value) })} required /></label>) : <label className="form-label w-100">Total score (0-100)<input className="form-control" type="number" min={0} max={100} value={total} onChange={(event) => setTotal(Number(event.target.value))} required /></label>}
        <label className="form-label w-100">Feedback<textarea className="form-control" value={feedback} onChange={(event) => setFeedback(event.target.value)} required /></label>
        <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save grade"}</button>
      </form>
    </div></section>}
  </>;
}
