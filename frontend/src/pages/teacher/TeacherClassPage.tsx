import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Alert } from "../../components/Alert";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Dialog } from "../../components/Dialog";
import { EmptyState } from "../../components/EmptyState";
import { GradebookPanel } from "../../components/GradebookPanel";
import { Field, Textarea } from "../../components/Field";
import { EditIcon, EyeIcon, IconButton, IconLinkButton } from "../../components/IconButton";
import { Pagination } from "../../components/Pagination";
import { Spinner } from "../../components/Spinner";
import { DataTable, TruncatedText, type Column } from "../../components/Table";
import { useToast } from "../../components/Toast";
import { classAssignmentsPath, classStudentsPath, request } from "../../lib/api";
import { ApiFailure } from "../../lib/errors";
import { deadlineBadge, formatDate, formatDateTime } from "../../lib/format";
import type { Assignment, ClassRow, FieldErrors, RosterResponse, RosterStudent } from "../../types";

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
  const requestedTab = searchParams.get("tab");
  const tab = requestedTab === "assignments" || requestedTab === "gradebook" ? requestedTab : "students";
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
      .catch(() => { setAssignmentsFailure("Unable to load assignments."); setAssignments([]); });
  }, [classId]);
  useEffect(() => { if (tab === "assignments") loadAssignments(); }, [loadAssignments, tab]);

  const [dialogAssignment, setDialogAssignment] = useState<Assignment | "new">();
  const [assignmentDraft, setAssignmentDraft] = useState({ title: "", description: "", due_at: "" });
  const [assignmentErrors, setAssignmentErrors] = useState<FieldErrors>({});
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const toast = useToast();

  function openCreate() {
    setAssignmentDraft({ title: "", description: "", due_at: "" });
    setAssignmentErrors({});
    setDialogAssignment("new");
  }
  function openEdit(assignment: Assignment) {
    const due = new Date(assignment.due_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    const localDueAt = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T${pad(due.getHours())}:${pad(due.getMinutes())}`;
    setAssignmentDraft({ title: assignment.title, description: assignment.description, due_at: localDueAt });
    setAssignmentErrors({});
    setDialogAssignment(assignment);
  }
  async function saveAssignment(event: FormEvent) {
    event.preventDefault();
    if (!dialogAssignment || !classId) return;
    setAssignmentBusy(true);
    const payload = { title: assignmentDraft.title.trim(), description: assignmentDraft.description.trim(), due_at: new Date(assignmentDraft.due_at).toISOString() };
    try {
      if (dialogAssignment === "new") {
        await request<Assignment>(classAssignmentsPath(Number(classId)), { method: "POST", token: token(), body: payload });
      } else {
        await request<Assignment>(`/assignments/${dialogAssignment.id}`, { method: "PATCH", token: token(), body: payload });
      }
      setDialogAssignment(undefined);
      loadAssignments();
    } catch (error) {
      if (error instanceof ApiFailure && error.fields) setAssignmentErrors(error.fields);
      else toast.error(error instanceof Error ? error.message : "Unable to save assignment.");
    } finally {
      setAssignmentBusy(false);
    }
  }

  const search = (event: FormEvent) => { event.preventDefault(); setPageNumber(1); setSubmitted(query); };

  const rosterColumns: Column<RosterStudent>[] = [
    { key: "name", header: "Name", width: "14rem", render: (s) => <TruncatedText>{s.full_name}</TruncatedText> },
    { key: "phone", header: "Phone", width: "9rem", render: (s) => s.phone || "—" },
    { key: "action", header: "Action", width: "6rem", render: (s) => <div className="row-actions"><IconLinkButton to={`/teacher/classes/${classId}/students/${s.id}`} icon={<EyeIcon />} label="View" /></div> },
  ];

  if (failure) return <Alert>{failure}</Alert>;
  if (!class_) return <Spinner label="Loading class" />;
  return <section className="page-stack">
    <Link className="back-link" to="/teacher/classes">‹ Back</Link>
    <div className="page-header"><h1>{class_.name}</h1></div>
    <div className="tabs" role="tablist">
      <button type="button" className="tab" role="tab" aria-selected={tab === "students"} onClick={() => setSearchParams({ tab: "students" })}>Students</button>
      <button type="button" className="tab" role="tab" aria-selected={tab === "assignments"} onClick={() => setSearchParams({ tab: "assignments" })}>Assignments</button>
      <button type="button" className="tab" role="tab" aria-selected={tab === "gradebook"} onClick={() => setSearchParams({ tab: "gradebook" })}>Bảng điểm</button>
    </div>
    {tab === "gradebook" && <GradebookPanel classId={Number(classId)} />}
    {tab === "students" && roster && <Card>
      <p>Đã ghi danh {roster.enrolled_students} · Đã nộp {roster.submitted_students} · Đã chấm {roster.graded_students}</p>
      <form className="filters" noValidate onSubmit={search}><div className="filters-row filters-search"><Field id="teacher-roster-search" label="Search Student" value={query} onChange={(event) => setQuery(event.target.value)} /><Button type="submit">Search</Button></div></form>
      {roster.students.results.length === 0 ? <EmptyState>No students.</EmptyState> : <><DataTable columns={rosterColumns} data={roster.students.results} rowKey={(s) => s.id} />
        <Pagination label="Students pagination" page={pageNumber} count={roster.students.count} onChange={setPageNumber} /></>}
    </Card>}
    {tab === "assignments" && <Card>
      <div className="page-header"><h2>Assignments</h2><Button onClick={openCreate}>Tạo assignment</Button></div>
      {assignmentsFailure && <Alert>{assignmentsFailure}</Alert>}
      {!assignments ? <Spinner label="Loading assignments" /> :
        assignments.length === 0 ? <EmptyState>No assignments.</EmptyState> :
          <DataTable rowKey={(assignment) => assignment.id} data={assignments} columns={[
            { key: "title", header: "Tên", width: "14rem", render: (assignment) => <TruncatedText>{assignment.title}</TruncatedText> },
            { key: "created", header: "Ngày tạo", width: "7rem", render: (assignment) => formatDate(assignment.created_at) },
            { key: "due", header: "Hạn nộp", width: "10rem", render: (assignment) => <>{formatDateTime(assignment.due_at)}<br /><span className="muted">{deadlineBadge(assignment.due_at, new Date())}</span></> },
            { key: "status", header: "Trạng thái", width: "7rem", render: (assignment) => <Badge className={statusBadgeClass(assignmentStatus(class_, assignment, new Date()))}>{assignmentStatus(class_, assignment, new Date())}</Badge> },
            { key: "submitted", header: "Đã nộp", width: "9rem", render: (assignment) => <>{assignment.submitted_count ?? 0}/{assignment.enrolled_count ?? 0}{!!assignment.graded_count && <> <Badge className="badge-active">{assignment.graded_count} đã chấm</Badge></>}</> },
            { key: "action", header: "Action", width: "6rem", render: (assignment) => {
              const editDisabled = new Date(assignment.due_at) <= new Date();
              return <div className="row-actions">
                <IconLinkButton to={`/teacher/assignments/${assignment.id}`} icon={<EyeIcon />} label="Xem" />
                <IconButton icon={<EditIcon />} label="Sửa" disabled={editDisabled} title={editDisabled ? "Assignment đã hết hạn, không thể chỉnh sửa." : undefined} onClick={() => openEdit(assignment)} />
              </div>;
            } },
          ]} />}
    </Card>}
    {dialogAssignment && <Dialog open onClose={() => setDialogAssignment(undefined)} title={dialogAssignment === "new" ? "Tạo assignment" : "Sửa assignment"} className="dialog-md">
      <form noValidate onSubmit={saveAssignment} className="form-grid">
        <Field id="assignment-title" label="Title" required wide disabled={dialogAssignment !== "new"} value={assignmentDraft.title} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, title: event.target.value })} error={assignmentErrors.title?.[0]} />
        <Textarea id="assignment-description" label="Description" required wide rows={4} value={assignmentDraft.description} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, description: event.target.value })} error={assignmentErrors.description?.[0]} />
        <Field id="assignment-due-at" label="Due at" type="datetime-local" required value={assignmentDraft.due_at} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, due_at: event.target.value })} error={assignmentErrors.due_at?.[0]} />
        <div className="field"><label>Max score</label><p className="field-static">100</p></div>
        <div className="dialog-actions field-full">
          <Button type="button" className="button-secondary" disabled={assignmentBusy} onClick={() => setDialogAssignment(undefined)}>Cancel</Button>
          <Button type="submit" disabled={assignmentBusy}>{assignmentBusy ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Dialog>}
  </section>;
}
