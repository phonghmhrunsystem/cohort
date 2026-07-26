import { FormEvent, useState } from "react";

import { login } from "../auth";

export function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setLoading(true);
    setError("");
    try {
      const user = await login(String(data.get("email")), String(data.get("password")));
      if (user.role === "ADMIN") window.location.assign("/admin/users");
      else setError("This account does not have admin access.");
    } catch (response) {
      setError((response as { detail?: string }).detail ?? "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return <main><h1>Class Management Demo</h1><form onSubmit={submit} aria-busy={loading}>
    <h2>Sign in</h2>
    <label>Email <input name="email" type="email" autoComplete="email" required /></label>
    <label>Password <input name="password" type="password" autoComplete="current-password" required /></label>
    <button disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
    {error && <p role="alert">{error}</p>}
  </form></main>;
}
