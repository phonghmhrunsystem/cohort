import { useRef, useState } from "react";

import { Alert } from "./Alert";
import { Button } from "./Button";
import { Card } from "./Card";
import {
  assignmentSubmissionsPath,
  downloadSubmission,
  request,
} from "../lib/api";
import { ApiFailure } from "../lib/errors";
import { formatDateTime } from "../lib/format";
import type { Submission } from "../types";
import { Table } from "./Table";

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".docx"];

const token = () => sessionStorage.getItem("access_token") ?? undefined;

function formatSize(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
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
  onPendingFileChange?: (hasPendingFile: boolean) => void;
  onClosed?: () => void;
}

export function SubmissionHistory({
  assignmentId,
  submissions,
  canSubmit,
  closureReason,
  onSubmitted,
  onPendingFileChange,
  onClosed,
}: SubmissionHistoryProps) {
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
      onPendingFileChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setError("");
    setFile(picked);
    onPendingFileChange?.(true);
  }

  function clearFile() {
    setFile(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
    onPendingFileChange?.(false);
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const created = await request<Submission>(
        assignmentSubmissionsPath(assignmentId),
        {
          method: "POST",
          token: token(),
          body: form,
        },
      );
      if (created) {
        onSubmitted(created);
        setFile(null);
        onPendingFileChange?.(false);
        if (inputRef.current) inputRef.current.value = "";
        setConfirmedAt(
          new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(new Date()),
        );
      }
    } catch (err) {
      if (err instanceof ApiFailure && err.status === 422) {
        setError(err.message);
        onClosed?.();
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
            <input
              ref={inputRef}
              id="submission-file"
              className="submission-file-input"
              type="file"
              accept=".pdf,.docx"
              onChange={pickFile}
            />
            {file ? (
              <div className="submission-dropzone submission-dropzone-filled">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                <div className="submission-dropzone-info">
                  <span className="submission-dropzone-filename">{file.name}</span>
                  <span className="muted submission-dropzone-size">{formatSize(file.size)}</span>
                </div>
                <label htmlFor="submission-file" className="button button-secondary submission-dropzone-replace">
                  Đổi file
                </label>
                <button type="button" aria-label="Xóa file" title="Xóa file" className="icon-button" onClick={clearFile}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                </button>
              </div>
            ) : (
              <label htmlFor="submission-file" className="submission-dropzone submission-dropzone-empty">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V4" />
                  <path d="M7 9l5-5 5 5" />
                  <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                </svg>
                <span className="submission-dropzone-text">Click để chọn file</span>
                <span className="muted submission-dropzone-hint">PDF hoặc DOCX, tối đa 25 MB</span>
              </label>
            )}
          </div>
          <div className="form-actions submission-actions">
            <Button disabled={!file || busy} onClick={submit}>
              {busy ? "Đang nộp…" : "Nộp bài"}
            </Button>
          </div>
        </Card>
      ) : (
        closureReason && (
          <Card>
            <p className="muted">{closureReason}</p>
          </Card>
        )
      )}

      <Card>
        <p className="section-title">Submission history</p>
        {submissions.length === 0 ? (
          <p className="muted">Bạn chưa nộp bài nào.</p>
        ) : (
          <Table>
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
                  <td>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Download"
                      title="Download"
                      onClick={() => downloadSubmission(item.id, item.original_filename)}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3v12" />
                        <path d="M7 10l5 5 5-5" />
                        <path d="M5 21h14" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
