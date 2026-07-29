import { useState, type FormEvent } from "react";

import { Card } from "../components/Card";
import { Field } from "../components/Field";
import { request } from "../lib/api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return setError("Email is required.");
    setError("");
    try { await request("/auth/forgot-password", { method: "POST", body: { email } }); } finally { setNotice("If an account exists for that email, we sent a reset link."); }
  }

  return <main className="public-page"><Card><h1>Forgot password</h1><p>Enter your email, we'll send a reset link.</p><form noValidate onSubmit={submit}>
    {notice && <p role="alert">{notice}</p>}
    <Field id="email" label="Email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} error={error} />
    <button type="submit">Send reset link</button>
  </form></Card></main>;
}
