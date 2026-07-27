export type Role = "ADMIN" | "TEACHER" | "STUDENT";

const accessTokenKey = "access_token";

export function startSession(token: string) {
  sessionStorage.setItem(accessTokenKey, token);
}

export function accessToken() {
  return sessionStorage.getItem(accessTokenKey);
}

export function clearSession() {
  sessionStorage.removeItem(accessTokenKey);
}

export function roleHome(role: Role) {
  return role === "ADMIN" ? "/admin/users" : role === "TEACHER" ? "/teacher/classes" : "/student/classes";
}

export function canAccess(path: string, role: Role) {
  return role === "ADMIN" ? path === "/admin/users" || path === "/admin/audit-logs" || /^\/admin\/classes(?:\/\d+)?$/.test(path) : role === "TEACHER" ? /^\/teacher\/classes(?:\/\d+)?$/.test(path) : /^\/student\/classes(?:\/\d+)?$/.test(path);
}

export function redirectToLogin() {
  clearSession();
  if (location.pathname !== "/login") location.assign("/login");
}
