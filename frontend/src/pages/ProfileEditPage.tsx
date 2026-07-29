import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { AccountForm, accountFormPayload, accountFormValue } from "../components/AccountForm";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { request } from "../lib/api";
import { ApiFailure } from "../lib/errors";
import type { FieldErrors } from "../types";

export function ProfileEditPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => accountFormValue(user ?? undefined));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault(); setErrors({}); setFailure(""); setBusy(true);
    try {
      await request("/auth/me", { method: "PATCH", token: sessionStorage.getItem("access_token") ?? undefined, body: accountFormPayload(draft) });
      await refresh();
      navigate("/profile");
    } catch (error) {
      if (error instanceof ApiFailure && error.fields) setErrors(error.fields);
      else setFailure(error instanceof Error ? error.message : "Unable to save profile.");
    } finally { setBusy(false); }
  }
  return <section className="page-stack"><h1>Edit profile</h1><Card><p className="muted">Email and role cannot be changed here.</p><form noValidate onSubmit={save}>
    {failure && <Alert>{failure}</Alert>}<AccountForm prefix="profile" value={draft} onChange={setDraft} errors={errors} />
    <div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button><Link to="/profile">Cancel</Link></div>
  </form></Card></section>;
}
