import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Alert } from "../../components/Alert";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { Field } from "../../components/Field";
import { EditIcon, EyeIcon, IconButton, IconLinkButton } from "../../components/IconButton";
import { Spinner } from "../../components/Spinner";
import { Table } from "../../components/Table";
import { classAssignmentsPath, classStudentsPath, request } from "../../lib/api";
import { deadlineBadge, formatDate, formatDateTime } from "../../lib/format";
import type { Assignment, ClassRow, RosterResponse } from "../../types";

function assignmentStatus(class_: ClassRow, assignment: Assignment, now: Date): "Đang mở" | "Hết hạn" | "Đã đóng" {
  const classOpen = class_.is_active && new Date(class_.starts_at) <= now && now < new Date(class_.ends_at);
  if (!classOpen) return "Đã đóng";
  return now < new Date(assignment.due_at) ? "Đang mở" : "Hết hạn";
}

function statusBadgeClass(status: string): string {
  if (status === "Đang mở") return "badge-active";
  if (status === "Hết hạn") return "badge-warning";
  return "badge-disabled";
}

export function TeacherClassPage() {
  const { classId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "assignments" ? "assignments" : "students";
  const [class_, setClass] = useState<ClassRow>();
  const [roster, setRoster] = useState<RosterResponse>();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [failure, setFailure] = useState("");
  const token = () => sessionStorage.getItem("access_token") ?? undefined;

  useEffect(() => {
    request<ClassRow>(`/classes/${classId}`, { token: token() }).then((value) => value && setClass(value)).catch(() => setFailure("Unable to load class."));
  }, [classId]);

  const loadRoster = useCallback(() => {
    if (!classId) return;
    request<RosterResponse>(classStudentsPath(Number(classId), { q: submitted || undefined, page: pageNumber === 1 ? undefined : pageNumber }), { token: token() })
      .then((value) => value && setRoster(value))
      .catch(() => setFailure("Unable to load roster."));
  }, [classId, submitted, pageNumber]);
  useEffect(() => { if (tab === "students") loadRoster(); }, [loadRoster, tab]);

  const [assignments, setAssignments] = useState<Assignment[]>();
  const [assignmentsFailure, setAssignmentsFailure] = useState("");

  const loadAssignments = useCallback(() => {
    if (!classId) return;
    request<Assignment[]>(classAssignmentsPath(Number(classId)), { token: token() })
      .then((value) => value && setAssignments(value))
      .catch(() => setAssignmentsFailure("Unable to load assignments."));
  }, [classId]);
  useEffect(() => { if (tab === "assignments") loadAssignments(); }, [loadAssignments, tab]);

  const search = (event: FormEvent) => { event.preventDefault(); setPageNumber(1); setSubmitted(query); };

  if (failure) return <Alert>{failure}</Alert>;
  if (!class_) return <Spinner label="Loading class" />;
  return <section className="page-stack">
    <Link className="back-link" to="/teacher/classes">‹ Back</Link>
    <h1>{class_.name}</h1>
    <div className="tabs" role="tablist">
      <button type="button" className="tab" role="tab" aria-selected={tab === "students"} onClick={() => setSearchParams({ tab: "students" })}>Students</button>
      <button type="button" className="tab" role="tab" aria-selected={tab === "assignments"} onClick={() => setSearchParams({ tab: "assignments" })}>Assignments</button>
    </div>
    {tab === "students" && roster && <Card>
      <p>Đã ghi danh {roster.enrolled_students} · Đã nộp {roster.submitted_students} · Đã chấm {roster.graded_students}</p>
      <form className="filters" noValidate onSubmit={search}><div className="filters-row filters-search"><Field id="teacher-roster-search" label="Search Student" value={query} onChange={(event) => setQuery(event.target.value)} /><Button type="submit">Search</Button></div></form>
      {roster.students.results.length === 0 ? <EmptyState>No students.</EmptyState> : <><Table><thead><tr><th>Name</th><th>Phone</th><th>Action</th></tr></thead>
        <tbody>{roster.students.results.map((s) => <tr key={s.id}><td>{s.full_name}</td><td>{s.phone || "—"}</td><td><div className="row-actions"><IconLinkButton to={`/teacher/classes/${classId}/students/${s.id}`} icon={<EyeIcon />} label="View" /></div></td></tr>)}</tbody>
      </Table><nav className="pagination" aria-label="Students pagination"><button disabled={!roster.students.previous} onClick={() => setPageNumber((v) => v - 1)}>Previous</button><span>Page {pageNumber}</span><button disabled={!roster.students.next} onClick={() => setPageNumber((v) => v + 1)}>Next</button></nav></>}
    </Card>}
    {tab === "assignments" && <Card>
      <div className="page-header"><h2>Assignments</h2></div>
      {assignmentsFailure && <Alert>{assignmentsFailure}</Alert>}
      {!assignments ? <Spinner label="Loading assignments" /> :
        assignments.length === 0 ? <EmptyState>No assignments.</EmptyState> :
          <Table><thead><tr><th>Tên</th><th>Ngày tạo</th><th>Hạn nộp</th><th>Trạng thái</th><th>Đã nộp</th><th>Action</th></tr></thead>
            <tbody>{assignments.map((assignment) => {
              const now = new Date();
              const status = assignmentStatus(class_, assignment, now);
              const editDisabled = new Date(assignment.due_at) <= now;
              return <tr key={assignment.id}>
                <td>{assignment.title}</td>
                <td>{formatDate(assignment.created_at)}</td>
                <td>{formatDateTime(assignment.due_at)}<br /><span className="muted">{deadlineBadge(assignment.due_at, now)}</span></td>
                <td><Badge className={statusBadgeClass(status)}>{status}</Badge></td>
                <td>{assignment.submitted_count ?? 0}/{assignment.enrolled_count ?? 0}{!!assignment.graded_count && <> <Badge className="badge-active">{assignment.graded_count} đã chấm</Badge></>}</td>
                <td><div className="row-actions">
                  <IconLinkButton to={`/teacher/assignments/${assignment.id}`} icon={<EyeIcon />} label="Xem" />
                  <IconButton icon={<EditIcon />} label="Sửa" disabled={editDisabled} title={editDisabled ? "Assignment đã hết hạn, không thể chỉnh sửa." : undefined} onClick={() => {}} />
                </div></td>
              </tr>;
            })}</tbody>
          </Table>}
    </Card>}
  </section>;
}
