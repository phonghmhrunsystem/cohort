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
      window.location.assign(user.role === "ADMIN" ? "/admin/users" : user.role === "TEACHER" ? "/teacher/cohorts" : "/student/cohorts");
    } catch (response) {
      setError((response as { detail?: string }).detail ?? "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="min-vh-100 d-flex align-items-center bg-body-tertiary py-4">
    <section className="card shadow-sm border-0 mx-auto w-100" style={{ maxWidth: "28rem" }}>
      <div className="card-body p-4 p-md-5">
        <p className="text-primary fw-semibold mb-2">Class Management</p>
        <h1 className="h3 mb-4">Sign in</h1>
        <form onSubmit={submit} aria-busy={loading} className="d-grid gap-3">
          <label className="form-label mb-0">Email<input className="form-control mt-1" name="email" type="email" autoComplete="email" required /></label>
          <label className="form-label mb-0">Password<input className="form-control mt-1" name="password" type="password" autoComplete="current-password" required /></label>
          <button className="btn btn-primary w-100" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
          {error && <p className="alert alert-danger mb-0" role="alert">{error}</p>}
        </form>
      </div>
    </section>
  </main>;
}
