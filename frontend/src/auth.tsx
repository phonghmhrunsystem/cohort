import { api } from "./api";

export type Role = "ADMIN" | "TEACHER" | "STUDENT";

export type User = {
  id: number;
  email: string;
  role: Role;
  is_active: boolean;
};

export async function login(email: string, password: string): Promise<User> {
  const token = await api<{ access: string }>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  sessionStorage.setItem("accessToken", token.access);
  return api<User>("/auth/me");
}
