export type Role = "ADMIN" | "TEACHER" | "STUDENT";

const accessTokenKey = "accessToken";

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
  return role === "ADMIN" ? "/admin/users" : role === "TEACHER" ? "/teacher/cohorts" : "/student/cohorts";
}

export function canAccess(path: string, role: Role) {
  return role === "ADMIN" ? path === "/admin/users" || path === "/admin/audit-logs" : role === "TEACHER" ? path === "/teacher/cohorts" || /^\/cohorts\/\d+$/.test(path) : path === "/student/cohorts" || /^\/cohorts\/\d+$/.test(path);
}

export function redirectToLogin() {
  clearSession();
  if (location.pathname !== "/login") location.assign("/login");
}
