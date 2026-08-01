import { useEffect, useState } from "react";

import { Alert } from "./Alert";
import { Dialog } from "./Dialog";
import { GradeDetail } from "./GradeDetail";
import { Spinner } from "./Spinner";
import { assignmentStudentResultPath, request } from "../lib/api";
import type { Grade } from "../types";

const token = () => sessionStorage.getItem("access_token") ?? undefined;

export interface GradeResultDialogProps {
  assignmentId: number;
  studentId: number;
  studentName: string;
  open: boolean;
  onClose: () => void;
}

export function GradeResultDialog({ assignmentId, studentId, studentName, open, onClose }: GradeResultDialogProps) {
  const [grade, setGrade] = useState<Grade>();
  const [failure, setFailure] = useState("");

  useEffect(() => {
    if (!open) return;
    setGrade(undefined);
    setFailure("");
    let active = true;
    request<Grade>(assignmentStudentResultPath(assignmentId, studentId), { token: token() })
      .then((loaded) => {
        if (active && loaded) setGrade(loaded);
      })
      .catch(() => {
        if (active) setFailure("Không tải được kết quả chấm.");
      });
    return () => {
      active = false;
    };
  }, [assignmentId, studentId, open]);

  return (
    <Dialog open={open} onClose={onClose} title={`Kết quả: ${studentName}`}>
      {failure ? <Alert>{failure}</Alert> : !grade ? <Spinner label="Loading result" /> : <GradeDetail grade={grade} />}
    </Dialog>
  );
}
