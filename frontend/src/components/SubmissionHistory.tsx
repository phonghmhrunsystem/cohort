import { useRef, useState } from "react";

import { Alert } from "./Alert";
import { Button } from "./Button";
import { Card } from "./Card";
import { assignmentSubmissionsPath, request, submissionDownloadUrl } from "../lib/api";
import { ApiFailure } from "../lib/errors";
import { formatDateTime } from "../lib/format";
import type { Submission } from "../types";

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".docx"];

const token = () => sessionStorage.getItem("access_token") ?? undefined;

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validate(file: File): string | null {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) return "Chỉ nhận file PDF hoặc DOCX.";
  if (file.size > MAX_BYTES) return "File vượt quá 25 MB.";
  return null;
}

export interface SubmissionHistoryProps {
  assignmentId: number;
  submissions: Submission[];
  canSubmit: boolean;
  closureReason: string | null;
  onSubmitted: (submission: Submission) => void;
}

export function SubmissionHistory({ assignmentId, submissions, canSubmit, closureReason, onSubmitted }: SubmissionHistoryProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    if (!picked) return;
    const problem = validate(picked);
    if (problem) {
      setError(problem);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setError("");
    setFile(picked);
  }

  function clearFile() {
    setFile(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const created = await request<Submission>(assignmentSubmissionsPath(assignmentId), {
        method: "POST",
        token: token(),
        body: form,
      });
      if (created) {
        onSubmitted(created);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        setConfirmedAt(
          new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()),
        );
      }
    } catch (err) {
      if (err instanceof ApiFailure && err.status === 422) {
        // Parent flips canSubmit/closureReason via its own assignment reload;
        // nothing else to do here — the form re-render (canSubmit=false) removes this block.
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Nộp bài thất bại.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {canSubmit ? (
        <Card>
          <p className="section-title">Submit a file</p>
          {error && <Alert>{error}</Alert>}
          {confirmedAt && <p className="muted">Đã nộp bài lúc {confirmedAt}</p>}
          <div className="submission-picker">
            <label htmlFor="submission-file">PDF or DOCX, choose file...</label>
            <input
              ref={inputRef}
              id="submission-file"
              type="file"
              onChange={pickFile}
            />
            {file && (
              <span className="submission-picked-file">
                {file.name}
                <button type="button" aria-label="x" onClick={clearFile}>x</button>
              </span>
            )}
          </div>
          <Button disabled={!file || busy} onClick={submit}>
            {busy ? "Đang nộp…" : "Nộp bài"}
          </Button>
        </Card>
      ) : (
        closureReason && <Card><p className="muted">{closureReason}</p></Card>
      )}

      <Card>
        <p className="section-title">Submission history</p>
        {submissions.length === 0 ? (
          <p className="muted">Bạn chưa nộp bài nào.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Submitted</th>
                <th>File</th>
                <th>Size</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((item) => (
                <tr key={item.id}>
                  <td>v{item.version}</td>
                  <td>{formatDateTime(item.created_at)}</td>
                  <td>{item.original_filename}</td>
                  <td>{formatSize(item.size)}</td>
                  <td><a href={submissionDownloadUrl(item.id)}>Download</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
