import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Alert } from "../../components/Alert";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { EyeIcon, IconLinkButton, UploadIcon } from "../../components/IconButton";
import { Spinner } from "../../components/Spinner";
import { DataTable, TruncatedText, type Column } from "../../components/Table";
import { classAssignmentsPath, request } from "../../lib/api";
import { formatDate, formatDateTime } from "../../lib/format";
import type { Assignment, ClassRow } from "../../types";

const LEARNING_STATE_LABEL: Record<string, { label: string }> = {
  OPEN: { label: "Chưa nộp" },
  SUBMITTED: { label: "Đã nộp" },
  GRADED: { label: "Đã chấm" },
  CLOSED: { label: "Đã đóng" },
};

export function StudentClassPage() {
  const { classId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "assignments" ? "assignments" : "resources";
  const [class_, setClass] = useState<ClassRow>();
  const [failure, setFailure] = useState("");
  useEffect(() => {
    request<ClassRow>(`/classes/${classId}`, { token: sessionStorage.getItem("access_token") ?? undefined })
      .then((value) => value && setClass(value))
      .catch((error) => setFailure(error instanceof Error ? error.message : "Unable to load class."));
  }, [classId]);
  const [assignments, setAssignments] = useState<Assignment[]>();
  const [assignmentsFailure, setAssignmentsFailure] = useState("");

  const loadAssignments = useCallback(() => {
    if (!classId) return;
    request<Assignment[]>(classAssignmentsPath(Number(classId)), { token: sessionStorage.getItem("access_token") ?? undefined })
      .then((value) => value && setAssignments(value))
      .catch(() => { setAssignmentsFailure("Unable to load assignments."); setAssignments([]); });
  }, [classId]);
  useEffect(() => { if (tab === "assignments") loadAssignments(); }, [loadAssignments, tab]);
  if (failure) return <Alert>{failure}</Alert>;
  if (!class_) return <Spinner label="Loading class" />;
  const progress = class_.assignment_count != null
    ? `Tiến độ: ${class_.graded_count}/${class_.assignment_count} đã chấm${class_.next_due_at ? ` · Hạn ${formatDate(class_.next_due_at)}` : ""}`
    : null;
  return <section className="page-stack">
    <Link className="back-link" to="/student/classes">‹ Back</Link>
    <h1>{class_.name}</h1>
    {progress && <p>{progress}</p>}
    <p>Giáo viên: {class_.teacher.full_name}</p>
    <div className="tabs" role="tablist">
      <button type="button" className="tab" role="tab" aria-selected={tab === "resources"} onClick={() => setSearchParams({ tab: "resources" })}>Class resources</button>
      <button type="button" className="tab" role="tab" aria-selected={tab === "assignments"} onClick={() => setSearchParams({ tab: "assignments" })}>Assignments</button>
    </div>
    {tab === "resources" && <Card><p className="muted">Class resources — see 07-notifications-and-resources.</p></Card>}
    {tab === "assignments" && <Card>
      {assignmentsFailure && <Alert>{assignmentsFailure}</Alert>}
      {!assignments ? <Spinner label="Loading assignments" /> :
        assignments.length === 0 ? <EmptyState>No assignments.</EmptyState> :
          <DataTable rowKey={(assignment) => assignment.id} data={assignments} columns={[
            { key: "title", header: "Tên", width: "14rem", render: (assignment) => <TruncatedText>{assignment.title}</TruncatedText> },
            { key: "due", header: "Hạn nộp", width: "10rem", render: (assignment) => <>{formatDateTime(assignment.due_at)}{assignment.deadline_badge && <><br /><span className="muted">{assignment.deadline_badge}</span></>}</> },
            { key: "state", header: "Trạng thái", width: "7rem", render: (assignment) => {
              const state = LEARNING_STATE_LABEL[assignment.learning_state ?? "CLOSED"];
              return <span title={assignment.learning_state === "CLOSED" ? assignment.closure_reason ?? undefined : undefined}>{state.label}</span>;
            } },
            { key: "score", header: "Điểm", width: "5rem", render: (assignment) => assignment.score ?? "—" },
            /** `Xem` opens the assignment page, which already covers history and results, so
             * the only second action worth a button is submitting (03 §2.2). */
            { key: "action", header: "Action", width: "9rem", render: (assignment) => <div className="row-actions">
              <IconLinkButton to={`/student/assignments/${assignment.id}`} icon={<EyeIcon />} label="Xem" />
              {assignment.learning_state === "OPEN" && (
                <IconLinkButton to={`/student/assignments/${assignment.id}`} icon={<UploadIcon />} label="Nộp bài" />
              )}
            </div> },
          ]} />}
    </Card>}
  </section>;
}
