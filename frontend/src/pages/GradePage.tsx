import { FormEvent, useEffect, useState } from "react";

import { api } from "../api";
import { Assignment, getAssignment } from "../assignments";
import { displayName } from "../auth";
import { listClassStudents } from "../classes";
import { Grade, submitGrade } from "../grading";

type SubmissionDetail = { id: number; assignment_id: number; student_id: number; version: number; original_filename: string; created_at: string; graded: boolean };

const message = (error: unknown) => {
  const failure = error as { detail?: string; fields?: Record<string, string[]> };
  return Object.values(failure.fields ?? {}).flat().join(" ") || failure.detail || "Unable to save this grade.";
};

export function GradePage({ assignmentId, submissionId }: { assignmentId: number; submissionId: number }) {
  const [assignment, setAssignment] = useState<Assignment>();
  const [submission, setSubmission] = useState<SubmissionDetail>();
  const [studentName, setStudentName] = useState("");
  const [scores, setScores] = useState<Record<number, number>>({});
  const [total, setTotal] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([getAssignment(assignmentId), api<SubmissionDetail>(`/submissions/${submissionId}`)]).then(async ([nextAssignment, nextSubmission]) => {
      setAssignment(nextAssignment);
      setScores(Object.fromEntries(nextAssignment.criteria.map((criterion) => [criterion.id!, 0])));
      setSubmission(nextSubmission);
      const roster = await listClassStudents(nextAssignment.classroom_id);
      const student = roster.students.find((candidate) => candidate.id === nextSubmission.student_id);
      setStudentName(student ? displayName(student) : `Student #${nextSubmission.student_id}`);
    }).catch((response) => setError(message(response)));
  }, [assignmentId, submissionId]);

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
    {!assignment || !submission ? <div className="alert alert-secondary">Loading…</div> : <>
      <p><strong>{studentName}</strong><br />{submission.original_filename} · <small className="text-secondary">{new Date(submission.created_at).toLocaleString()}</small><br /><small className="text-secondary">Version {submission.version}</small></p>
      {grade ? <div className="alert alert-success" role="status">Đã chấm. Total score: {grade.total_score}. Feedback: {grade.feedback}</div>
        : submission.graded ? <div className="alert alert-secondary" role="status">Đã chấm.</div>
        : <section className="card border-0 shadow-sm"><div className="card-body">
      <form onSubmit={submit}>
        {assignment.criteria.length ? assignment.criteria.map((criterion) => <label className="form-label w-100" key={criterion.id}>{criterion.title} (0-{criterion.maximum_score})<input className="form-control" type="number" min={0} max={criterion.maximum_score} value={scores[criterion.id!] ?? 0} onChange={(event) => setScores({ ...scores, [criterion.id!]: Number(event.target.value) })} required /></label>) : <label className="form-label w-100">Total score (0-100)<input className="form-control" type="number" min={0} max={100} value={total} onChange={(event) => setTotal(Number(event.target.value))} required /></label>}
        <label className="form-label w-100">Feedback<textarea className="form-control" value={feedback} onChange={(event) => setFeedback(event.target.value)} required /></label>
        <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Chấm điểm"}</button>
      </form>
    </div></section>}
    </>}
  </>;
}
