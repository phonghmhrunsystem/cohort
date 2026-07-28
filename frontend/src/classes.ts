import { User } from "./auth";
import { api } from "./api";

export type Class = { id: number; teacher_id: number; name: string; description: string; starts_at: string; ends_at: string };
export type Enrollment = { id: number; class_id: number; student_id: number };
export type ClassDraft = Pick<Class, "name" | "description" | "starts_at" | "ends_at">;
export type Student = Pick<User, "id" | "full_name" | "email">;

const query = (value = "") => value ? `?${new URLSearchParams({ q: value })}` : "";
const json = (method: string, body: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const listClasses = (q = "") => api<Class[]>(`/classes${query(q)}`);
export const getClass = (id: number) => api<Class>(`/classes/${id}`);
export const createClass = (draft: ClassDraft & { teacher_id: number }) => api<Class>("/classes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
export const updateClass = (id: number, draft: ClassDraft) => api<Class>(`/classes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
export const listClassStudents = (id: number, q = "") => api<Student[]>(`/classes/${id}/students${query(q)}`);
export const listEnrolledStudents = (id: number, q = "") => api<Student[]>(`/classes/${id}/enrollments${query(q)}`);
export const replaceEnrollment = (id: number, student_ids: number[]) => api<Student[]>(`/classes/${id}/enrollments`, json("PUT", { student_ids }));
export const enrollStudent = (classId: number, studentId: number) => api<Enrollment>(`/classes/${classId}/enrollments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student_id: studentId }) });
export const removeStudent = (classId: number, studentId: number) => api<void>(`/classes/${classId}/enrollments/${studentId}`, { method: "DELETE" });
export const listTeachers = (q = "") => api<User[]>(`/users?${new URLSearchParams({ q, role: "TEACHER" })}`);
export const listStudentAccounts = (q = "") => api<User[]>(`/users?${new URLSearchParams({ q, role: "STUDENT" })}`);
