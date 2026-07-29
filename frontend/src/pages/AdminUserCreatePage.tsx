import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AccountForm, accountFormErrors, accountFormPayload, accountFormValue, type AccountFormValue } from "../components/AccountForm";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Field, Select } from "../components/Field";
import { request } from "../lib/api";
import { ApiFailure } from "../lib/errors";
import type { FieldErrors } from "../types";

export function AdminUserCreatePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AccountFormValue>(accountFormValue());
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"TEACHER" | "STUDENT">("TEACHER");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  function validate(): FieldErrors {
    const found: FieldErrors = accountFormErrors(profile);
    const address = email.trim();
    if (!address) found.email = ["Email is required."];
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) found.email = ["Enter a valid email address."];
    if (!password) found.password = ["Initial password is required."];
    else if (password.length < 8) found.password = ["Use at least 8 characters."];
    return found;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setFailure("");
    const invalid = validate();
    if (Object.keys(invalid).length) return setErrors(invalid);
    setErrors({}); setBusy(true);
    try {
      await request("/users", {
        method: "POST",
        token: sessionStorage.getItem("access_token") ?? undefined,
        body: { ...accountFormPayload(profile), email: email.trim(), role, password },
      });
      navigate("/admin/users");
    } catch (error) {
      if (error instanceof ApiFailure && error.fields) setErrors(error.fields);
      else setFailure(error instanceof Error ? error.message : "Unable to create account.");
    } finally { setBusy(false); }
  }

  return <section className="page-stack">
    <div className="page-header"><h1>Create User</h1></div>
    <Card><form noValidate onSubmit={save}>
      {failure && <Alert>{failure}</Alert>}
      <fieldset className="form-section">
        <legend className="section-title">Account access</legend>
        <div className="form-grid">
          <Field id="create-email" label="Email" type="email" required autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} error={errors.email?.[0]} />
          <Select id="create-role" label="Role" required value={role} onChange={(event) => setRole(event.target.value as "TEACHER" | "STUDENT")} error={errors.role?.[0]}>
            <option value="TEACHER">Teacher</option><option value="STUDENT">Student</option>
          </Select>
          <Field id="create-password" label="Initial password" type="password" required autoComplete="new-password" hint="At least 8 characters." value={password} onChange={(event) => setPassword(event.target.value)} error={errors.password?.[0]} />
        </div>
      </fieldset>
      <AccountForm prefix="create" value={profile} onChange={setProfile} errors={errors} />
      <div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</Button><Link to="/admin/users">Cancel</Link></div>
    </form></Card>
  </section>;
}
