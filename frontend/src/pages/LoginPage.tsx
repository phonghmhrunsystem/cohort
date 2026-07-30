import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth, roleHome } from "../auth/AuthProvider";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Field } from "../components/Field";
import { PasswordField } from "../components/PasswordField";
import { ApiFailure } from "../lib/errors";

export function LoginPage() {
  const { login, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { ...(email.trim() ? {} : { email: ["Email is required."] }), ...(password ? {} : { password: ["Password is required."] }) };
    if (Object.keys(next).length) return setErrors(next);
    setErrors({}); setNotice("");
    try {
      const account = await login({ email, password });
      await refresh();
      navigate(account.must_change_password ? "/change-password" : roleHome(), { replace: true });
    } catch (error) {
      if (error instanceof ApiFailure && error.fields) setErrors(error.fields);
      else setNotice(error instanceof Error ? error.message : "Unable to sign in.");
    }
  }

  return <main className="public-page"><Card><h1>Sign in</h1><form noValidate onSubmit={submit}>
    {(notice || params.get("reset") === "success") && <p role="alert" className={notice ? "alert" : "notice"}>{notice || "Your password has been reset. Sign in with your new password."}</p>}
    <Field id="email" label="Email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} error={errors.email?.[0]} />
    <PasswordField
      id="password" label="Password" required autoComplete="current-password"
      value={password} onChange={(event) => setPassword(event.target.value)} error={errors.password?.[0]}
    />
    <Button type="submit">Sign in</Button>
  </form><Link className="link-underline" to="/forgot-password">Forgot password?</Link></Card></main>;
}
