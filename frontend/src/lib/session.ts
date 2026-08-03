const accessKey = "access_token";
const refreshKey = "refresh_token";

export function getAccessToken(): string | null {
  return sessionStorage.getItem(accessKey);
}

export function getRefreshToken(): string | null {
  return sessionStorage.getItem(refreshKey);
}

export function setTokens(access: string, refresh: string): void {
  sessionStorage.setItem(accessKey, access);
  sessionStorage.setItem(refreshKey, refresh);
}

export function setAccessToken(access: string): void {
  sessionStorage.setItem(accessKey, access);
}

export function clearTokens(): void {
  sessionStorage.removeItem(accessKey);
  sessionStorage.removeItem(refreshKey);
}
