import { useEffect, useState } from "react";

import { Card } from "./Card";
import { request, assignmentMyResultPath } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type { Grade, RubricCriterion, Submission } from "../types";

const token = () => sessionStorage.getItem("access_token") ?? undefined;

export interface ResultBlockProps {
  assignmentId: number;
  criteria: RubricCriterion[];
  submissions: Submission[];
}

export function ResultBlock({ assignmentId, criteria, submissions }: ResultBlockProps) {
  const [grade, setGrade] = useState<Grade>();

  useEffect(() => {
    request<Grade>(assignmentMyResultPath(assignmentId), { token: token() }).then((loaded) => {
      if (loaded) setGrade(loaded);
    });
  }, [assignmentId]);

  if (!grade) return null;

  const criterionById = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const filename = submissions.find((submission) => submission.id === grade.submission_id)?.original_filename;

  return (
    <Card>
      <p className="section-title">Kết quả</p>
      <p>Điểm: {grade.total_score} / 100</p>
      {grade.scores.length > 0 && (
        <ul className="result-scores">
          {grade.scores.map((score) => {
            const criterion = criterionById.get(score.criterion_id);
            return (
              <li key={score.criterion_id}>
                <span>{criterion?.title}</span> <span>{score.score} / {criterion?.maximum_score}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p>Nhận xét: "{grade.feedback}"</p>
      <p className="muted">
        Đã chấm {formatDateTime(grade.created_at)} · chấm trên {filename}
      </p>
    </Card>
  );
}
