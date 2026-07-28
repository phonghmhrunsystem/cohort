import { FormEvent, useEffect, useState } from "react";

import { api } from "../api";
import { LatestSubmissions } from "../components/LatestSubmissions";
import { SubmissionHistory } from "../components/SubmissionHistory";
import { Role } from "../session";

type Submission = { id: number; student_id: number; version: number; original_filename: string; note: string; created_at: string };

const message = (error: unknown) => {
  const failure = error as { detail?: string; fields?: Record<string, string[]> };
  return Object.values(failure.fields ?? {}).flat().join(" ") || failure.detail || "Unable to load submissions.";
};

export function AssignmentPage({ assignmentId, role }: { assignmentId: number; role: Extract<Role, "TEACHER" | "STUDENT"> }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const load = async () => {
    try { setSubmissions(await api<Submission[]>(`/assignments/${assignmentId}/submissions`)); }
    catch (response) { setError(message(response)); }
  };
  useEffect(() => { void load(); }, [assignmentId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setSaving(true); setError("");
    try {
      const body = new FormData(); body.append("file", file); body.append("note", note.trim());
      await api(`/assignments/${assignmentId}/submissions`, { method: "POST", body });
      setFile(null); setNote(""); event.currentTarget.reset(); await load();
    } catch (response) { setError(message(response)); } finally { setSaving(false); }
  }
  return <><a href={`/${role.toLowerCase()}/classes`}>My Classes</a><h1 className="h2 mt-2">Assignment submissions</h1>{error && <div className="alert alert-danger" role="alert">{error}</div>}{role === "STUDENT" ? <><section className="card border-0 shadow-sm mb-3"><div className="card-body"><h2 className="h4">Submit a file</h2><form onSubmit={submit}><label className="form-label w-100">PDF or DOCX<input className="form-control" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></label><label className="form-label w-100">Note<textarea className="form-control" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} /></label><button className="btn btn-primary" disabled={saving}>{saving ? "Uploading…" : "Upload submission"}</button></form></div></section><SubmissionHistory submissions={submissions} /></> : <LatestSubmissions submissions={submissions} />}</>;
}
