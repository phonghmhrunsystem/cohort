import { User } from "./auth";
import { api } from "./api";

export type Cohort = { id: number; teacher_id: number; name: string; description: string };
export type Enrollment = { id: number; cohort_id: number; student_id: number };

export const listCohorts = () => api<Cohort[]>("/cohorts");
export const getCohort = (id: number) => api<Cohort>(`/cohorts/${id}`);
export const createCohort = (cohort: Pick<Cohort, "name" | "description">) => api<Cohort>("/cohorts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cohort) });
export const updateCohort = (id: number, cohort: Pick<Cohort, "name" | "description">) => api<Cohort>(`/cohorts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cohort) });
export const enrollStudent = (cohortId: number, studentId: number) => api<Enrollment>(`/cohorts/${cohortId}/enrollments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student_id: studentId }) });

export async function listStudentAccounts() {
  return (await api<User[]>("/users")).filter((user) => user.role === "STUDENT");
}
