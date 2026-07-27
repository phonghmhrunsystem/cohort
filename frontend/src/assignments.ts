import { api } from "./api";

export type RubricCriterion = { id?: number; title: string; maximum_score: number };
export type Assignment = { id: number; classroom_id: number; title: string; description: string; due_at: string; maximum_score: number; criteria: RubricCriterion[] };
export type AssignmentDraft = Pick<Assignment, "title" | "description" | "due_at">;

const json = (method: string, body: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const listAssignments = (classId: number) => api<Assignment[]>(`/classes/${classId}/assignments`);
export const createAssignment = (classId: number, draft: AssignmentDraft) => api<Assignment>(`/classes/${classId}/assignments`, json("POST", draft));
export const updateAssignment = (id: number, draft: Partial<AssignmentDraft>) => api<Assignment>(`/assignments/${id}`, json("PATCH", draft));
export const replaceRubric = (id: number, criteria: RubricCriterion[]) => api<Assignment>(`/assignments/${id}/rubric`, json("PUT", { criteria }));
