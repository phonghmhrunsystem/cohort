import { formatDateTime } from "../lib/format";
import type { Grade } from "../types";

export interface GradeDetailProps {
  grade: Grade;
  filename?: string;
}

export function GradeDetail({ grade, filename }: GradeDetailProps) {
  return (
    <>
      <p>Điểm: {grade.total_score} / 100</p>
      {grade.scores.length > 0 && (
        <ul className="result-scores">
          {grade.scores.map((score) => (
            <li key={score.criterion_id}>
              <span>{score.criterion_title}</span> <span>{score.score} / {score.maximum_score}</span>
            </li>
          ))}
        </ul>
      )}
      <p>Nhận xét: "{grade.feedback}"</p>
      <p className="muted">
        Đã chấm {formatDateTime(grade.created_at)}{filename ? ` · chấm trên ${filename}` : ""}
      </p>
    </>
  );
}
