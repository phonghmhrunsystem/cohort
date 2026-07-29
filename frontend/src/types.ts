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
