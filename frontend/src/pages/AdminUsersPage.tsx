import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { AccountActions } from "../components/AccountActions";
import { AccountForm, accountFormPayload, accountFormValue } from "../components/AccountForm";
import { Alert } from "../components/Alert";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { Field } from "../components/Field";
import { Spinner } from "../components/Spinner";
import { Table } from "../components/Table";
import { request, usersPath } from "../lib/api";
import { ApiFailure } from "../lib/errors";
import type { FieldErrors, Page, User, UserFilters } from "../types";

const token = () => sessionStorage.getItem("access_token") ?? undefined;
const blankCreate = { profile: accountFormValue(), email: "", role: "TEACHER" as "TEACHER" | "STUDENT", password: "" };

export function AdminUsersPage() {
  const [draft, setDraft] = useState<UserFilters>({});
  const [submitted, setSubmitted] = useState<UserFilters>({});
  const [pageNumber, setPageNumber] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<Page<User>>();
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [create, setCreate] = useState(blankCreate);
  const [createErrors, setCreateErrors] = useState<FieldErrors>({});
  const [passwordUser, setPasswordUser] = useState<User>();
  const [passwords, setPasswords] = useState({ new_password: "", confirm_new_password: "" });
  const [passwordErrors, setPasswordErrors] = useState<FieldErrors>({});
  const [confirmation, setConfirmation] = useState<{ kind: "status" | "delete"; account: User }>();
  const [confirmationError, setConfirmationError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true); setFailure("");
    try {
      const result = await request<Page<User>>(usersPath({ ...submitted, page: pageNumber === 1 ? undefined : pageNumber }), { token: token() });
      if (generation === requestGeneration.current && result) setData(result);
    } catch (error) {
      if (generation === requestGeneration.current) setFailure(error instanceof Error ? error.message : "Unable to load accounts.");
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [submitted, pageNumber, refreshKey]);

  useEffect(() => { void load(); }, [load]);
  const refresh = () => setRefreshKey((value) => value + 1);
  const search = (event: FormEvent) => {
    event.preventDefault();
    setPageNumber(1);
    setSubmitted({ ...draft });
  };
  const field = (name: keyof UserFilters, value: string) => setDraft({ ...draft, [name]: value || undefined });

  async function createAccount(event: FormEvent) {
    event.preventDefault(); setCreateErrors({}); setBusy(true);
    try {
      await request("/users", {
        method: "POST", token: token(),
        body: { ...accountFormPayload(create.profile), email: create.email, role: create.role, password: create.password },
      });
      setCreateOpen(false); setCreate(blankCreate); refresh();
    } catch (error) {
      if (error instanceof ApiFailure && error.fields) setCreateErrors(error.fields);
    } finally { setBusy(false); }
  }

  async function setPassword(event: FormEvent) {
    event.preventDefault();
    if (!passwordUser) return;
    setPasswordErrors({}); setBusy(true);
    try {
      await request(`/users/${passwordUser.id}/reset-password`, { method: "POST", token: token(), body: passwords });
      setPasswordUser(undefined); setPasswords({ new_password: "", confirm_new_password: "" }); refresh();
    } catch (error) {
      if (error instanceof ApiFailure && error.fields) setPasswordErrors(error.fields);
    } finally { setBusy(false); }
  }

  async function confirmMutation() {
    if (!confirmation) return;
    setConfirmationError(""); setBusy(true);
    try {
      const { account, kind } = confirmation;
      await request(`/users/${account.id}${kind === "status" ? "/status" : ""}`, {
        method: kind === "status" ? "PATCH" : "DELETE",
        token: token(),
        body: kind === "status" ? { is_active: !account.is_active } : undefined,
      });
      setConfirmation(undefined); refresh();
    } catch (error) {
      setConfirmationError(error instanceof Error ? error.message : "Unable to update account.");
    } finally { setBusy(false); }
  }

  const openPassword = (account: User) => {
    setPasswordErrors({}); setPasswords({ new_password: "", confirm_new_password: "" }); setPasswordUser(account);
  };
  const openConfirmation = (kind: "status" | "delete", account: User) => {
    setConfirmationError(""); setConfirmation({ kind, account });
  };
  const statusAction = confirmation?.account.is_active ? "Disable" : "Enable";

  return <section className="page-stack">
    <div className="page-header"><div><h1>Accounts</h1><p>Manage Teacher and Student access.</p></div>
      <Button onClick={() => { setCreateErrors({}); setCreate(blankCreate); setCreateOpen(true); }}>Create account</Button>
    </div>
    <Card><form className="filters" noValidate onSubmit={search}>
      <Field id="account-search" label="Search accounts" value={draft.q ?? ""} onChange={(event) => field("q", event.target.value)} />
      <label className="field" htmlFor="account-role"><span>Role</span><select id="account-role" value={draft.role ?? ""} onChange={(event) => field("role", event.target.value)}><option value="">All</option><option value="TEACHER">Teacher</option><option value="STUDENT">Student</option></select></label>
      <Field id="created-from" label="Created from" type="date" value={draft.created_from ?? ""} onChange={(event) => field("created_from", event.target.value)} />
      <Field id="created-to" label="Created to" type="date" value={draft.created_to ?? ""} onChange={(event) => field("created_to", event.target.value)} />
      <Field id="updated-from" label="Updated from" type="date" value={draft.updated_from ?? ""} onChange={(event) => field("updated_from", event.target.value)} />
      <Field id="updated-to" label="Updated to" type="date" value={draft.updated_to ?? ""} onChange={(event) => field("updated_to", event.target.value)} />
      <Button type="submit">Search</Button>
    </form></Card>
    {loading && !data ? <Spinner label="Loading accounts" /> : failure ? <Alert>{failure} <button onClick={() => void load()}>Retry</button></Alert> :
      data?.results.length === 0 ? <EmptyState>No accounts found.</EmptyState> :
        data && <><Table><thead><tr><th>Email</th><th>Full name</th><th>Phone</th><th>Created</th><th>Updated</th><th>Role</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{data.results.map((account) => <tr key={account.id}><td>{account.email}</td><td>{account.full_name}</td><td>{account.phone || "—"}</td><td>{formatDate(account.created_at)}</td><td>{formatDate(account.updated_at)}</td><td>{roleLabel(account.role)}</td><td><Badge className={account.is_active ? "badge-active" : "badge-disabled"}>{account.is_active ? "Active" : "Disabled"}</Badge></td><td><AccountActions account={account} onPassword={() => openPassword(account)} onStatus={() => openConfirmation("status", account)} onDelete={() => openConfirmation("delete", account)} /></td></tr>)}</tbody>
        </Table><nav className="pagination" aria-label="Accounts pagination"><button disabled={!data.previous} aria-label="Previous page" onClick={() => setPageNumber((value) => value - 1)}>Previous</button><span>Page {pageNumber}</span><button disabled={!data.next} aria-label="Next page" onClick={() => setPageNumber((value) => value + 1)}>Next</button></nav></>}

    {createOpen && <Dialog open onClose={() => setCreateOpen(false)} title="Create account"><form noValidate onSubmit={createAccount}>
      <Field id="create-email" label="Email" type="email" autoComplete="off" value={create.email} onChange={(event) => setCreate({ ...create, email: event.target.value })} error={createErrors.email?.[0]} />
      <label className="field" htmlFor="create-role"><span>Role</span><select id="create-role" value={create.role} onChange={(event) => setCreate({ ...create, role: event.target.value as "TEACHER" | "STUDENT" })}><option value="TEACHER">Teacher</option><option value="STUDENT">Student</option></select></label>
      <AccountForm prefix="create" value={create.profile} onChange={(profile) => setCreate({ ...create, profile })} errors={createErrors} />
      <Field id="create-password" label="Initial password" type="password" autoComplete="new-password" value={create.password} onChange={(event) => setCreate({ ...create, password: event.target.value })} error={createErrors.password?.[0]} />
      <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
    </form></Dialog>}
    {passwordUser && <Dialog open onClose={() => setPasswordUser(undefined)} title={`Set password for ${passwordUser.email}`}><form noValidate onSubmit={setPassword}>
      <Field id="admin-new-password" label="New password" type="password" autoComplete="new-password" value={passwords.new_password} onChange={(event) => setPasswords({ ...passwords, new_password: event.target.value })} error={passwordErrors.new_password?.[0]} />
      <Field id="admin-confirm-password" label="Confirm new password" type="password" autoComplete="new-password" value={passwords.confirm_new_password} onChange={(event) => setPasswords({ ...passwords, confirm_new_password: event.target.value })} error={passwordErrors.confirm_new_password?.[0]} />
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Set password"}</Button>
    </form></Dialog>}
    {confirmation && <Dialog open onClose={() => setConfirmation(undefined)} title={confirmation.kind === "delete" ? "Delete account" : `${statusAction} account`}>
      <p>{confirmation.kind === "delete" ? "This permanently hides the account." : `${statusAction} access for ${confirmation.account.email}?`}</p>
      {confirmationError && <Alert>{confirmationError}</Alert>}
      <Button className={confirmation.kind === "delete" || confirmation.account.is_active ? "button-danger" : ""} disabled={busy} onClick={() => void confirmMutation()}>{confirmation.kind === "delete" ? "Delete account" : `${statusAction} account`}</Button>
    </Dialog>}
  </section>;
}

const formatDate = (value?: string) => value ? new Intl.DateTimeFormat("en-GB").format(new Date(value)) : "—";
export const roleLabel = (role: User["role"]) => role[0] + role.slice(1).toLowerCase();
