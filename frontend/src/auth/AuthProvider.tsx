import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { request } from "../lib/api";
import { clearTokens, getAccessToken, setTokens } from "../lib/session";
import type { LoginPayload, LoginResponse, User } from "../types";

type AuthState = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (payload: LoginPayload) => Promise<User>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function roleHome() {
  return "/dashboard";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const started = useRef(false);

  const clear = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setUser((await request<User>("/auth/me", { token })) ?? null);
    } catch (error) {
      if (typeof error === "object" && error && "status" in error && error.status === 401) clear();
      else setUser(null);
    } finally {
      setLoading(false);
    }
  }, [clear]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void refresh();
  }, [refresh]);

  const login = useCallback(async (payload: LoginPayload) => {
    const response = await request<LoginResponse>("/auth/login", { method: "POST", body: payload });
    if (!response) throw new Error("Login failed.");
    setTokens(response.access_token, response.refresh_token);
    setUser(response.user);
    return response.user;
  }, []);

  const logout = useCallback(async () => {
    const token = getAccessToken();
    try {
      if (token) await request("/auth/logout", { method: "POST", token });
    } finally {
      clear();
    }
  }, [clear]);

  return <AuthContext.Provider value={{ user, loading, refresh, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside AuthProvider.");
  return auth;
}
