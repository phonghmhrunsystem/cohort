import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Alert } from "../../components/Alert";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { DataTable, TruncatedText, type Column } from "../../components/Table";
import { useToast } from "../../components/Toast";
import { classGradebookPath, downloadGradebookCsv, request } from "../../lib/api";
import type { ClassRow, GradebookCell, GradebookResponse, GradebookStudent, LearningState } from "../../types";

const stateLabels: Record<Exclude<LearningState, "GRADED">, string> = {
  SUBMITTED: "Đã nộp",
  OPEN: "Chưa nộp",
  CLOSED: "Đã đóng",
};

/** A cell is never blank: a graded Assignment shows its score, everything else shows its state. */
function cellText(cell: GradebookCell): string {
  return cell.learning_state === "GRADED" ? String(cell.score) : stateLabels[cell.learning_state];
}

export function TeacherGradebookPage() {
  const { classId } = useParams();
  const [class_, setClass] = useState<ClassRow>();
  const [gradebook, setGradebook] = useState<GradebookResponse>();
  const [failure, setFailure] = useState("");
  const toast = useToast();
  const token = () => sessionStorage.getItem("access_token") ?? undefined;

  useEffect(() => {
    request<ClassRow>(`/classes/${classId}`, { token: token() }).then((value) => value && setClass(value)).catch(() => setFailure("Unable to load class."));
  }, [classId]);

  useEffect(() => {
    if (!classId) return;
    request<GradebookResponse>(classGradebookPath(Number(classId)), { token: token() })
      .then((value) => value && setGradebook(value))
      .catch(() => setFailure("Unable to load gradebook."));
  }, [classId]);

  async function exportCsv() {
    if (!classId) return;
    try {
      await downloadGradebookCsv(Number(classId));
    } catch {
      toast.error("Unable to export CSV.");
    }
  }

  if (failure) return <Alert>{failure}</Alert>;
  if (!class_ || !gradebook) return <Spinner label="Loading gradebook" />;

  const columns: Column<GradebookStudent>[] = [
    {
      key: "student",
      header: "Học viên",
      width: "14rem",
      className: "gradebook-student",
      render: (student) => <>
        <TruncatedText>{student.full_name || student.email}</TruncatedText>
        {!student.is_active && <Badge className="badge-disabled">đã tắt</Badge>}
      </>,
    },
    ...gradebook.assignments.map((assignment) => ({
      key: `assignment-${assignment.id}`,
      header: <Link to={`/teacher/assignments/${assignment.id}`}>{assignment.title} ({assignment.maximum_score})</Link>,
      width: "9rem",
      render: (student: GradebookStudent) => {
        const cell = student.grades.find((grade) => grade.assignment_id === assignment.id);
        return cell ? cellText(cell) : "";
      },
    })),
  ];

  const empty = gradebook.assignments.length === 0 || gradebook.students.length === 0;
  return <section className="page-stack">
    <Link className="back-link" to={`/teacher/classes/${classId}`}>‹ Back</Link>
    <div className="page-header">
      <div>
        <h1>Bảng điểm: {class_.name}</h1>
        <p>Chỉ xem — không chấm điểm ở đây.</p>
      </div>
    </div>
    <Card>
      {empty ? <EmptyState>Lớp chưa có bài tập hoặc học viên.</EmptyState> : <>
        <div className="gradebook-table"><DataTable columns={columns} data={gradebook.students} rowKey={(student) => student.id} /></div>
        <div className="form-actions gradebook-actions"><Button onClick={exportCsv}>Xuất CSV</Button></div>
      </>}
    </Card>
  </section>;
}
