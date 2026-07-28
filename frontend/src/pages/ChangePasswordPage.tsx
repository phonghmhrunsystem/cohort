import { FormEvent, useState } from "react";
import { changePassword } from "../auth";

export function ChangePasswordPage() {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try { await changePassword(String(data.get("current_password")), String(data.get("new_password"))); location.assign("/login"); }
    catch (e) { setError((e as { detail?: string }).detail || "Unable to change password."); }
  }
  return <main className="min-vh-100 d-flex align-items-center bg-body-tertiary"><form className="card p-4 mx-auto w-100" style={{ maxWidth: "28rem" }} onSubmit={submit}><h1 className="h3">Change password</h1><p>Set a new password to continue.</p>{error && <p className="alert alert-danger">{error}</p>}<label className="form-label">Temporary password<input className="form-control" name="current_password" type="password" required /></label><label className="form-label">New password<input className="form-control" name="new_password" type="password" minLength={8} maxLength={128} required /></label><button className="btn btn-primary">Continue</button></form></main>;
}
