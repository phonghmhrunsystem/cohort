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
};

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
