import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Alert } from "../../components/Alert";
import { Card } from "../../components/Card";
import { ResultBlock } from "../../components/ResultBlock";
import { Spinner } from "../../components/Spinner";
import { SubmissionHistory } from "../../components/SubmissionHistory";
import { assignmentSubmissionsPath, request } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import type { Assignment, Submission } from "../../types";

const token = () => sessionStorage.getItem("access_token") ?? undefined;

const STATE_LABEL: Record<NonNullable<Assignment["learning_state"]>, string> = {
  OPEN: "Chưa nộp",
  SUBMITTED: "Đã nộp",
  GRADED: "Đã chấm",
  CLOSED: "Đã đóng",
};

export function StudentAssignmentPage() {
  const { assignmentId } = useParams();
  const [assignment, setAssignment] = useState<Assignment>();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [failure, setFailure] = useState("");
  const [hasUnsavedFile, setHasUnsavedFile] = useState(false);

  const load = useCallback(() => {
    if (!assignmentId) return;
    Promise.all([
      request<Assignment>(`/assignments/${assignmentId}`, { token: token() }),
      request<Submission[]>(assignmentSubmissionsPath(Number(assignmentId)), { token: token() }),
    ])
      .then(([loadedAssignment, loadedSubmissions]) => {
        if (loadedAssignment) setAssignment(loadedAssignment);
        if (loadedSubmissions) setSubmissions(loadedSubmissions);
      })
      .catch(() => setFailure("Unable to load assignment."));
  }, [assignmentId]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!hasUnsavedFile) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedFile]);

  function handleBackClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (hasUnsavedFile && !window.confirm("Bạn chưa nộp bài, thoát?")) {
      event.preventDefault();
    }
  }

  function handleSubmitted(submission: Submission) {
    setSubmissions((current) => [submission, ...current]);
    setAssignment((current) => (current ? { ...current, learning_state: "SUBMITTED" } : current));
  }

  if (failure) return <Alert>{failure}</Alert>;
  if (!assignment) return <Spinner label="Loading assignment" />;

  const canSubmit = assignment.learning_state === "OPEN" || assignment.learning_state === "SUBMITTED";

  return (
    <section className="page-stack">
      <Link className="back-link" to={`/student/classes/${assignment.classroom_id}?tab=assignments`} onClick={handleBackClick}>
        ‹ Back to Class
      </Link>
      <div className="page-header">
        <div>
          <h1>{assignment.title}</h1>
          {assignment.due_at && (
            <p className="assignment-due">
              Hạn nộp {formatDateTime(assignment.due_at)}
              {assignment.deadline_badge && <> · <span>{assignment.deadline_badge}</span></>}
            </p>
          )}
        </div>
        {assignment.learning_state && <span className="badge">{STATE_LABEL[assignment.learning_state]}</span>}
      </div>
      {assignment.description && (
        <Card><p className="assignment-description">{assignment.description}</p></Card>
      )}
      {assignment.learning_state === "GRADED" && (
        <ResultBlock assignmentId={assignment.id} criteria={assignment.criteria} submissions={submissions} />
      )}
      <SubmissionHistory
        assignmentId={assignment.id}
        submissions={submissions}
        canSubmit={canSubmit}
        closureReason={assignment.closure_reason}
        onSubmitted={handleSubmitted}
        onPendingFileChange={setHasUnsavedFile}
        onClosed={load}
      />
    </section>
  );
}
