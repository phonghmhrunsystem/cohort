import { api } from "./api";
import { clearSession, Role, startSession } from "./session";

export type { Role } from "./session";

export type User = {
  id: number;
  full_name: string | null;
  email: string;
  role: Role;
  phone: string | null;
  date_of_birth: string | null;
  gender: "NAM" | "NU" | "KHAC" | null;
  address: string | null;
  is_active: boolean;
  must_change_password?: boolean;
};

export type ProfileDraft = Pick<User, "full_name" | "phone" | "date_of_birth" | "gender" | "address">;

export const displayName = (user: Pick<User, "full_name" | "email">) => user.full_name?.trim() || user.email.split("@")[0];

export async function login(email: string, password: string): Promise<User> {
  const response = await api<{ access_token: string; user: User }>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  startSession(response.access_token);
  return response.user;
}

export async function logout() {
  try {
    await api<void>("/auth/logout", { method: "POST" });
  } finally {
    clearSession();
  }
}

export const getCurrentUser = () => api<User>("/auth/me");

export const updateProfile = (profile: ProfileDraft) => api<User>("/auth/me", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(profile),
});

export const changePassword = (current_password: string, new_password: string) => api<void>("/auth/change-password", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ current_password, new_password }),
});
export const requestPasswordReset = (email: string) => api<void>("/password-reset-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
