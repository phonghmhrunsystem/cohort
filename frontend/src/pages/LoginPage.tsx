import { FormEvent, useState } from "react";
import { login, requestPasswordReset } from "../auth";
import { ApiFailure } from "../api";
import { roleHome } from "../session";

export function LoginPage() {
  const [error, setError] = useState(""); const [forgot, setForgot] = useState(false); const [notice, setNotice] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); setLoading(true); setError(""); try { const user = await login(String(data.get("email")), String(data.get("password"))); location.assign(user.must_change_password ? "/change-password" : roleHome(user.role)); } catch (e) { setError((e as ApiFailure).detail || "Unable to sign in."); } finally { setLoading(false); } }
  async function reset(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await requestPasswordReset(String(new FormData(event.currentTarget).get("email"))); setNotice("If the account exists, the request was sent to an Admin."); setForgot(false); }
  return <main className="min-vh-100 d-flex align-items-center bg-body-tertiary py-4"><section className="card shadow-sm border-0 mx-auto w-100" style={{ maxWidth: "28rem" }}><div className="card-body p-4"><h1 className="h3 mb-4">Sign in</h1>{notice && <p className="alert alert-success">{notice}</p>}<form onSubmit={submit} className="d-grid gap-3"><label>Email<input className="form-control" name="email" type="email" required /></label><label>Password<input className="form-control" name="password" type="password" required /></label><button className="btn btn-primary" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>{error && <p className="alert alert-danger">{error}</p>}</form><button className="btn btn-link px-0 mt-2" onClick={() => setForgot(!forgot)}>Forgot password?</button>{forgot && <form className="d-flex gap-2" onSubmit={reset}><input className="form-control" name="email" type="email" placeholder="Email" required /><button className="btn btn-outline-primary">Send</button></form>}</div></section></main>;
}
