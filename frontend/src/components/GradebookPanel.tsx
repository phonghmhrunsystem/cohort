import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Alert } from "./Alert";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { GradeResultDialog } from "./GradeResultDialog";
import { Spinner } from "./Spinner";
import { DataTable, TruncatedText, type Column } from "./Table";
import { useToast } from "./Toast";
import { classGradebookPath, downloadGradebookCsv, request } from "../lib/api";
import type { GradebookResponse, GradebookStudent, LearningState } from "../types";

const stateLabels: Record<Exclude<LearningState, "GRADED">, string> = {
  SUBMITTED: "Đã nộp",
  OPEN: "Chưa nộp",
  CLOSED: "Đã đóng",
};

interface Reviewing {
  assignmentId: number;
  studentId: number;
  studentName: string;
}

export function GradebookPanel({ classId }: { classId: number }) {
  const [gradebook, setGradebook] = useState<GradebookResponse>();
  const [failure, setFailure] = useState("");
  const [reviewing, setReviewing] = useState<Reviewing>();
  const toast = useToast();
  const token = () => sessionStorage.getItem("access_token") ?? undefined;

  useEffect(() => {
    request<GradebookResponse>(classGradebookPath(classId), { token: token() })
      .then((value) => value && setGradebook(value))
      .catch(() => setFailure("Unable to load gradebook."));
  }, [classId]);

  async function exportCsv() {
    try {
      await downloadGradebookCsv(classId);
    } catch {
      toast.error("Unable to export CSV.");
    }
  }

  if (failure) return <Alert>{failure}</Alert>;
  if (!gradebook) return <Spinner label="Loading gradebook" />;

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
        if (!cell) return "";
        if (cell.learning_state !== "GRADED") return stateLabels[cell.learning_state];
        const studentName = student.full_name || student.email;
        return (
          <button
            type="button"
            className="gradebook-cell-button"
            aria-label={`Xem kết quả ${studentName} · ${assignment.title}`}
            onClick={() => setReviewing({ assignmentId: assignment.id, studentId: student.id, studentName })}
          >
            {cell.score}
          </button>
        );
      },
    })),
  ];

  const empty = gradebook.assignments.length === 0 || gradebook.students.length === 0;
  return <Card>
    {empty ? <EmptyState>Lớp chưa có bài tập hoặc học viên.</EmptyState> : <>
      <div className="gradebook-table"><DataTable columns={columns} data={gradebook.students} rowKey={(student) => student.id} /></div>
      <div className="form-actions gradebook-actions"><Button onClick={exportCsv}>Xuất CSV</Button></div>
    </>}
    {reviewing && (
      <GradeResultDialog
        assignmentId={reviewing.assignmentId}
        studentId={reviewing.studentId}
        studentName={reviewing.studentName}
        open
        onClose={() => setReviewing(undefined)}
      />
    )}
  </Card>;
}
