import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Alert } from "../../components/Alert";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { EyeIcon, IconLinkButton } from "../../components/IconButton";
import { Spinner } from "../../components/Spinner";
import { Table } from "../../components/Table";
import { classAssignmentsPath, request } from "../../lib/api";
import { formatDate, formatDateTime } from "../../lib/format";
import type { Assignment, ClassRow } from "../../types";

const LEARNING_STATE_LABEL: Record<string, { label: string; action: string | null }> = {
  OPEN: { label: "Chưa nộp", action: "Nộp bài" },
  SUBMITTED: { label: "Đã nộp", action: "Xem lịch sử" },
  GRADED: { label: "Đã chấm", action: "Xem kết quả" },
  CLOSED: { label: "Đã đóng", action: null },
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
          <Table><thead><tr><th>Tên</th><th>Hạn nộp</th><th>Trạng thái</th><th>Điểm</th><th>Action</th></tr></thead>
            <tbody>{assignments.map((assignment) => {
              const state = LEARNING_STATE_LABEL[assignment.learning_state ?? "CLOSED"];
              return <tr key={assignment.id}>
                <td>{assignment.title}</td>
                <td>{formatDateTime(assignment.due_at)}{assignment.deadline_badge && <><br /><span className="muted">{assignment.deadline_badge}</span></>}</td>
                <td title={assignment.learning_state === "CLOSED" ? assignment.closure_reason ?? undefined : undefined}>{state.label}</td>
                <td>—</td>
                <td><div className="row-actions">
                  <IconLinkButton to={`/student/assignments/${assignment.id}`} icon={<EyeIcon />} label="Xem" />
                  {state.action && <Link className="button button-secondary" to={`/student/assignments/${assignment.id}`}>{state.action}</Link>}
                </div></td>
              </tr>;
            })}</tbody>
          </Table>}
    </Card>}
  </section>;
}
