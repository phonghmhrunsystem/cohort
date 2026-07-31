import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Field, Textarea } from "../../components/Field";
import { Spinner } from "../../components/Spinner";
import { downloadSubmission, request, submissionGradePath, submissionPath } from "../../lib/api";
import { ApiFailure } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import type { Assignment, GradeSubmissionInfo } from "../../types";

const NOT_LATEST_MESSAGE = "Only the latest submission version can be graded.";
const ALREADY_GRADED_MESSAGE = "This Assignment has already been graded.";

const token = () => sessionStorage.getItem("access_token") ?? undefined;
const formatSize = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

export function TeacherGradePage() {
  const { assignmentId, submissionId } = useParams();
  const navigate = useNavigate();
  const [submission, setSubmission] = useState<GradeSubmissionInfo>();
  const [assignment, setAssignment] = useState<Assignment>();
  const [scores, setScores] = useState<Record<number, string>>({});
  const [totalScore, setTotalScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [failure, setFailure] = useState("");
  const [staleReload, setStaleReload] = useState(false);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      request<GradeSubmissionInfo>(submissionPath(Number(submissionId)), { token: token() }),
      request<Assignment>(`/assignments/${assignmentId}`, { token: token() }),
    ])
      .then(([loadedSubmission, loadedAssignment]) => {
        if (loadedSubmission) setSubmission(loadedSubmission);
        if (loadedAssignment) setAssignment(loadedAssignment);
        if (loadedSubmission?.graded) setLocked(true);
      })
      .catch(() => setFailure("Unable to load submission."));
  }, [assignmentId, submissionId]);
  useEffect(() => {
    load();
  }, [load]);

  const hasRubric = Boolean(assignment?.criteria.length);
  const total = hasRubric
    ? (assignment?.criteria ?? []).reduce((sum, criterion) => sum + (Number(scores[criterion.id]) || 0), 0)
    : Number(totalScore) || 0;
  const allFilled = hasRubric
    ? (assignment?.criteria ?? []).every((criterion) => scores[criterion.id] !== undefined && scores[criterion.id] !== "")
    : totalScore !== "";
  const canSubmit = allFilled && feedback.trim() !== "" && !busy;

  async function submitGrade(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || !submissionId) return;
    setBusy(true);
    setFailure("");
    try {
      const body = hasRubric
        ? {
          scores: (assignment?.criteria ?? []).map((criterion) => ({
            criterion_id: criterion.id,
            score: Number(scores[criterion.id]),
          })),
          feedback,
        }
        : { total_score: Number(totalScore), feedback };
      await request(submissionGradePath(Number(submissionId)), {
        method: "PUT",
        token: token(),
        body,
      });
      navigate(`/teacher/assignments/${assignmentId}`);
    } catch (err) {
      if (err instanceof ApiFailure && err.status === 422 && err.message === NOT_LATEST_MESSAGE) {
        setStaleReload(true);
      } else if (err instanceof ApiFailure && err.status === 422 && err.message === ALREADY_GRADED_MESSAGE) {
        setLocked(true);
      } else if (err instanceof ApiFailure && err.fields) {
        setFailure(Object.values(err.fields).flat().join(" "));
      } else {
        setFailure(err instanceof Error ? err.message : "Chấm điểm thất bại.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (failure && (!submission || !assignment)) return <Alert>{failure}</Alert>;
  if (!submission || !assignment) return <Spinner label="Loading submission" />;

  return (
    <section className="page-stack">
      <Link className="back-link" to={`/teacher/assignments/${assignmentId}`}>
        ‹ Back to assignment
      </Link>
      <div className="page-header">
        <div>
          <h1>Chấm bài — <span>{submission.student_name}</span></h1>
          <p className="assignment-due">
            {assignment.title} · Hạn nộp {formatDateTime(assignment.due_at)}
          </p>
        </div>
      </div>
      <Card>
        <p>
          <span>{submission.original_filename}</span> {formatSize(submission.size)} {formatDateTime(submission.created_at)}
        </p>
        <Button
          className="button-secondary"
          onClick={() => downloadSubmission(submission.id, submission.original_filename)}
        >
          Tải
        </Button>
      </Card>

      {locked ? (
        <Alert>Assignment này đã được chấm.</Alert>
      ) : staleReload ? (
        <Alert>
          Học viên đã nộp bản mới, tải lại trang.{" "}
          <button type="button" className="link-button" onClick={load}>
            Tải lại
          </button>
        </Alert>
      ) : (
        <Card>
          <form noValidate onSubmit={submitGrade} className="grade-form">
            {failure && <Alert>{failure}</Alert>}
            {hasRubric ? (
              assignment.criteria.map((criterion) => (
                <Field
                  key={criterion.id}
                  id={`criterion-${criterion.id}`}
                  label={`${criterion.title} (${criterion.maximum_score})`}
                  type="number"
                  min={0}
                  max={criterion.maximum_score}
                  value={scores[criterion.id] ?? ""}
                  onChange={(event) =>
                    setScores((current) => ({ ...current, [criterion.id]: event.target.value }))
                  }
                />
              ))
            ) : (
              <Field
                id="total-score"
                label="Total score (0-100)"
                type="number"
                min={0}
                max={100}
                value={totalScore}
                onChange={(event) => setTotalScore(event.target.value)}
              />
            )}
            <Textarea
              id="feedback"
              label="Feedback"
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
            />
            {hasRubric && <p>Total: {total} / 100</p>}
            <p className="muted">Chấm xong là chốt, không sửa lại được.</p>
            <div className="form-actions">
              <Button type="submit" disabled={!canSubmit}>
                {busy ? "Đang chấm…" : "Chấm điểm"}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </section>
  );
}
