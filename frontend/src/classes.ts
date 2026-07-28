import { User } from "./auth";
import { api } from "./api";

export type Class = { id: number; teacher_id: number; name: string; description: string; starts_at: string; ends_at: string };
export type Enrollment = { id: number; class_id: number; student_id: number };
export type ClassDraft = Pick<Class, "name" | "description" | "starts_at" | "ends_at">;
export type StudentProgress = Pick<User, "id" | "full_name" | "email"> & { submitted_assignments: number; graded_assignments: number };
export type ClassRoster = { total_assignments: number; enrolled_students: number; submitted_students: number; graded_students: number; students: StudentProgress[] };
export type StudentProfile = StudentProgress & { phone: string | null; date_of_birth: string | null; gender: User["gender"]; address: string | null; total_assignments: number; shared_classes: Class[] };

const query = (value = "") => value ? `?${new URLSearchParams({ q: value })}` : "";

export const listClasses = (q = "") => api<Class[]>(`/classes${query(q)}`);
export const getClass = (id: number) => api<Class>(`/classes/${id}`);
export const createClass = (draft: ClassDraft & { teacher_id: number }) => api<Class>("/classes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
export const updateClass = (id: number, draft: ClassDraft) => api<Class>(`/classes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
export const listClassStudents = (id: number, q = "") => api<ClassRoster>(`/classes/${id}/students${query(q)}`);
export const getClassStudent = (classId: number, studentId: number) => api<StudentProfile>(`/classes/${classId}/students/${studentId}`);
export const enrollStudent = (classId: number, studentId: number) => api<Enrollment>(`/classes/${classId}/enrollments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student_id: studentId }) });
export const removeStudent = (classId: number, studentId: number) => api<void>(`/classes/${classId}/enrollments/${studentId}`, { method: "DELETE" });
export const listTeachers = (q = "") => api<User[]>(`/users?${new URLSearchParams({ q, role: "TEACHER" })}`);
export const listStudentAccounts = (q = "") => api<User[]>(`/users?${new URLSearchParams({ q, role: "STUDENT" })}`);
