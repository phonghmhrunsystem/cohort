import { FormEvent, useState } from "react";

import { login } from "../auth";
import { ApiFailure } from "../api";
import { roleHome } from "../session";

export function LoginPage() {
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setLoading(true);
    setError("");
    setFields({});
    try {
      const user = await login(String(data.get("email")), String(data.get("password")));
      window.location.assign(roleHome(user.role));
    } catch (response) {
      const failure = response as ApiFailure;
      setError(failure.detail || "Unable to sign in.");
      setFields(failure.fields ?? {});
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
          <label className="form-label mb-0">Email<input className={`form-control mt-1${fields.email ? " is-invalid" : ""}`} name="email" type="email" autoComplete="email" required />{fields.email?.map((message) => <span className="invalid-feedback d-block" key={message}>{message}</span>)}</label>
          <label className="form-label mb-0">Password<input className={`form-control mt-1${fields.password ? " is-invalid" : ""}`} name="password" type="password" autoComplete="current-password" required />{fields.password?.map((message) => <span className="invalid-feedback d-block" key={message}>{message}</span>)}</label>
          <button className="btn btn-primary w-100" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
          {error && <p className="alert alert-danger mb-0" role="alert">{error}</p>}
        </form>
      </div>
    </section>
  </main>;
}
