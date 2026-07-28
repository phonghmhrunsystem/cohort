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
  return role === "ADMIN" ? path === "/admin/users" || path === "/admin/audit-logs" || /^\/admin\/classes(?:\/\d+)?$/.test(path) : role === "TEACHER" ? path === "/profile" || /^\/teacher\/(?:classes|assignments)\/\d+$/.test(path) || /^\/teacher\/classes\/\d+\/gradebook$/.test(path) || path === "/teacher/classes" || /^\/teacher\/assignments\/\d+\/submissions\/\d+\/grade$/.test(path) : path === "/profile" || /^\/student\/(?:classes|assignments)\/\d+$/.test(path) || path === "/student/classes" || /^\/student\/assignments\/\d+\/result$/.test(path);
}

export function redirectToLogin() {
  clearSession();
  if (location.pathname !== "/login") location.assign("/login");
}
