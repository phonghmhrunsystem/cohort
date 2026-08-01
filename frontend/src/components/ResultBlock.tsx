import { useEffect, useState } from "react";

import { Card } from "./Card";
import { GradeDetail } from "./GradeDetail";
import { request, assignmentMyResultPath } from "../lib/api";
import type { Grade, Submission } from "../types";

const token = () => sessionStorage.getItem("access_token") ?? undefined;

export interface ResultBlockProps {
  assignmentId: number;
  submissions: Submission[];
}

export function ResultBlock({ assignmentId, submissions }: ResultBlockProps) {
  const [grade, setGrade] = useState<Grade>();

  useEffect(() => {
    request<Grade>(assignmentMyResultPath(assignmentId), { token: token() })
      .then((loaded) => {
        if (loaded) setGrade(loaded);
      })
      .catch(() => {});
  }, [assignmentId]);

  if (!grade) return null;

  return (
    <Card>
      <p className="section-title">Kết quả</p>
      <GradeDetail
        grade={grade}
        filename={submissions.find((submission) => submission.id === grade.submission_id)?.original_filename}
      />
    </Card>
  );
}
