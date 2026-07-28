import { api } from "./api";

export type CriterionScore = { criterion_id: number; score: number };
export type Grade = {
  id: number;
  assignment_id: number;
  student_id: number;
  submission_id: number;
  total_score: number;
  feedback: string;
  scores: CriterionScore[];
  created_at: string;
};
export type GradeInput = { feedback: string; scores: CriterionScore[] } | { feedback: string; total_score: number };

const json = (method: string, body: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const submitGrade = (submissionId: number, input: GradeInput) => api<Grade>(`/submissions/${submissionId}/grade`, json("PUT", input));
export const getMyResult = (assignmentId: number) => api<Grade>(`/assignments/${assignmentId}/my-result`);
