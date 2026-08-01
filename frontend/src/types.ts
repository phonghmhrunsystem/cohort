export type Role = "ADMIN" | "TEACHER" | "STUDENT";
export type Gender = "NAM" | "NU" | "KHAC";

export interface User {
  id: number;
  full_name: string;
  email: string;
  role: Role;
  phone: string | null;
  date_of_birth: string | null;
  gender: Gender | null;
  hometown: string | null;
  address: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type FieldErrors = Record<string, string[]>;

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  user: User;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  new_password: string;
  confirm_new_password: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
  confirm_new_password: string;
}

export interface UserCreatePayload {
  full_name: string;
  email: string;
  password: string;
  role: Exclude<Role, "ADMIN">;
  phone?: string;
  date_of_birth?: string;
  gender?: Gender;
  hometown?: string;
  address?: string;
}

export interface UserUpdatePayload {
  full_name?: string;
  phone?: string;
  date_of_birth?: string | null;
  gender?: Gender | null;
  hometown?: string;
  address?: string;
}

export interface UserStatusPayload {
  is_active: boolean;
}

export interface AdminResetPasswordPayload {
  new_password: string;
  confirm_new_password: string;
}

export interface UserFilters {
  q?: string;
  role?: Exclude<Role, "ADMIN">;
  created_from?: string;
  created_to?: string;
  updated_from?: string;
  updated_to?: string;
  page?: number;
}

export interface ClassRow {
  id: number;
  name: string;
  description: string;
  teacher: { id: number; full_name: string; email: string };
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  student_count: number;
  assignment_count: number | null;
  graded_count: number | null;
  next_due_at: string | null;
}

export interface ClassFilters {
  q?: string;
  teacher?: string;
  page?: number;
}

export interface ClassFormPayload {
  name: string;
  description: string;
  starts_at: string;
  ends_at: string;
  teacher_id: number;
}

export interface RosterStudent {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  hometown: string | null;
  is_active: boolean;
  enrolled_at: string;
  submitted_assignments: number;
  graded_assignments: number;
}

export interface RosterResponse {
  total_assignments: number;
  enrolled_students: number;
  submitted_students: number;
  graded_students: number;
  students: Page<RosterStudent>;
}

export interface Candidate {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  hometown: string | null;
  is_active: boolean;
}

export interface RubricCriterion {
  id: number;
  title: string;
  maximum_score: number;
}

export interface Assignment {
  id: number;
  classroom_id: number;
  title: string;
  description: string;
  due_at: string;
  maximum_score: number;
  criteria: RubricCriterion[];
  created_at: string;
  learning_state: "OPEN" | "SUBMITTED" | "GRADED" | "CLOSED" | null;
  deadline_badge: string | null;
  closure_reason: string | null;
  submitted_count?: number | null;
  graded_count?: number | null;
  enrolled_count?: number | null;
  score?: number | null;
}

export interface Submission {
  id: number;
  assignment_id: number;
  student_id: number;
  student_name: string | null;
  version: number;
  original_filename: string;
  content_type: string;
  size: number;
  created_at: string;
  graded: boolean;
}

export interface TeacherSubmissionRow {
  student_id: number;
  student_name: string | null;
  is_active: boolean;
  submission: {
    id: number;
    original_filename: string;
    content_type: string;
    size: number;
    created_at: string;
  } | null;
  graded: boolean;
  score: number | null;
}

export type LearningState = "OPEN" | "SUBMITTED" | "GRADED" | "CLOSED";

export interface GradebookCell {
  assignment_id: number;
  learning_state: LearningState;
  score: number | null;
}

export interface GradebookAssignment {
  id: number;
  title: string;
  maximum_score: number;
}

export interface GradebookStudent {
  id: number;
  full_name: string | null;
  email: string;
  is_active: boolean;
  grades: GradebookCell[];
}

export interface GradebookResponse {
  assignments: GradebookAssignment[];
  students: GradebookStudent[];
}

export interface CriterionScoreResult {
  criterion_id: number;
  score: number;
}

export interface Grade {
  id: number;
  assignment_id: number;
  student_id: number;
  submission_id: number;
  total_score: number;
  feedback: string;
  scores: CriterionScoreResult[];
  created_at: string;
}

export interface GradeSubmissionInfo {
  id: number;
  assignment_id: number;
  student_id: number;
  student_name: string | null;
  original_filename: string;
  content_type: string;
  size: number;
  created_at: string;
  graded: boolean;
}
