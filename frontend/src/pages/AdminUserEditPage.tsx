import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { AccountForm, accountFormPayload, accountFormValue, type AccountFormValue } from "../components/AccountForm";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Spinner } from "../components/Spinner";
import { request } from "../lib/api";
import { ApiFailure } from "../lib/errors";
import type { FieldErrors, User } from "../types";
import { roleLabel } from "./AdminUsersPage";

export function AdminUserEditPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [account, setAccount] = useState<User>();
  const [draft, setDraft] = useState<AccountFormValue>();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    request<User>(`/users/${userId}`, { token: sessionStorage.getItem("access_token") ?? undefined })
      .then((value) => { if (value) { setAccount(value); setDraft(accountFormValue(value)); } })
      .catch((error) => setFailure(error instanceof ApiFailure && error.status === 404 ? "Account not found." : error instanceof Error ? error.message : "Unable to load account."));
  }, [userId]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setErrors({}); setFailure(""); setBusy(true);
    try {
      await request(`/users/${userId}`, { method: "PATCH", token: sessionStorage.getItem("access_token") ?? undefined, body: accountFormPayload(draft) });
      navigate(`/admin/users/${userId}`);
    } catch (error) {
      if (error instanceof ApiFailure && error.fields) setErrors(error.fields);
      else setFailure(error instanceof Error ? error.message : "Unable to save account.");
    } finally { setBusy(false); }
  }
  if (failure && !account) return <Alert>{failure}</Alert>;
  if (!account || !draft) return <Spinner label="Loading account" />;
  return <section className="page-stack"><h1>Edit account</h1><Card>
    <dl className="identity-grid" aria-label="Immutable identity"><div><dt>Email</dt><dd>{account.email}</dd></div><div><dt>Role</dt><dd>{roleLabel(account.role)}</dd></div></dl>
    <form noValidate onSubmit={save}>{failure && <Alert>{failure}</Alert>}<AccountForm prefix="admin-edit" value={draft} onChange={setDraft} errors={errors} /><div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button><Link to={`/admin/users/${userId}`}>Cancel</Link></div></form>
  </Card></section>;
}
