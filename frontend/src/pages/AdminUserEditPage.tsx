import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { AccountForm, accountFormErrors, accountFormPayload, accountFormValue, type AccountFormValue } from "../components/AccountForm";
import { Alert } from "../components/Alert";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Spinner } from "../components/Spinner";
import { request } from "../lib/api";
import { ApiFailure } from "../lib/errors";
import type { FieldErrors, User } from "../types";
import { Info } from "./AdminUserViewPage";
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
    setFailure("");
    const invalid = accountFormErrors(draft);
    if (Object.keys(invalid).length) return setErrors(invalid);
    setErrors({}); setBusy(true);
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
  return <section className="page-stack">
    <div className="page-header"><h1>Edit User</h1></div>
    <Card>
      <h2 className="section-title">Account access</h2>
      <dl className="identity-grid" aria-label="Immutable identity">
        <Info label="Email" value={account.email} />
        <Info label="Role" value={roleLabel(account.role)} />
        <Info label="Status" value={<Badge className={account.is_active ? "badge-active" : "badge-disabled"}>{account.is_active ? "Active" : "Disabled"}</Badge>} />
      </dl>
    </Card>
    <Card><form noValidate onSubmit={save}>
      {failure && <Alert>{failure}</Alert>}
      <AccountForm prefix="admin-edit" value={draft} onChange={setDraft} errors={errors} />
      <div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button><Link to={`/admin/users/${userId}`}>Cancel</Link></div>
    </form></Card>
  </section>;
}
