import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { AccountActions } from "../../../components/AccountActions";
import { Alert } from "../../../components/Alert";
import { Badge } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { Dialog } from "../../../components/Dialog";
import { EmptyState } from "../../../components/EmptyState";
import { Field, Select } from "../../../components/Field";
import { PasswordField } from "../../../components/PasswordField";
import { Pagination } from "../../../components/Pagination";
import { Spinner } from "../../../components/Spinner";
import { DataTable, type Column } from "../../../components/Table";
import { useToast } from "../../../components/Toast";
import { request, usersPath } from "../../../lib/api";
import { ApiFailure } from "../../../lib/errors";
import { formatDate, roleLabel } from "../../../lib/format";
import type { FieldErrors, Page, User, UserFilters } from "../../../types";

const token = () => sessionStorage.getItem("access_token") ?? undefined;

export function AdminUsersPage() {
  const [draft, setDraft] = useState<UserFilters>({});
  const [submitted, setSubmitted] = useState<UserFilters>({});
  const [pageNumber, setPageNumber] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<Page<User>>();
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [passwordUser, setPasswordUser] = useState<User>();
  const [passwords, setPasswords] = useState({ new_password: "", confirm_new_password: "" });
  const [passwordErrors, setPasswordErrors] = useState<FieldErrors>({});
  const [confirmation, setConfirmation] = useState<{ kind: "status" | "delete"; account: User }>();
  const [confirmationError, setConfirmationError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestGeneration = useRef(0);
  const toast = useToast();

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

  async function setPassword(event: FormEvent) {
    event.preventDefault();
    if (!passwordUser) return;
    const invalid: FieldErrors = {};
    if (passwords.new_password.length < 8) invalid.new_password = ["Use at least 8 characters."];
    if (passwords.new_password !== passwords.confirm_new_password) invalid.confirm_new_password = ["Passwords do not match."];
    if (Object.keys(invalid).length) return setPasswordErrors(invalid);
    setPasswordErrors({}); setBusy(true);
    try {
      await request(`/users/${passwordUser.id}/reset-password`, { method: "POST", token: token(), body: passwords });
      toast.success(`Password updated for ${passwordUser.email}.`);
      setPasswordUser(undefined); setPasswords({ new_password: "", confirm_new_password: "" }); refresh();
    } catch (error) {
      if (error instanceof ApiFailure && error.fields) setPasswordErrors(error.fields);
      toast.error(error instanceof Error ? error.message : "Unable to update password.");
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
      if (kind === "delete") toast.warning(`Deleted account ${account.email}.`);
      else if (account.is_active) toast.warning(`Disabled account ${account.email}.`);
      else toast.success(`Enabled account ${account.email}.`);
      setConfirmation(undefined); refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update account.";
      setConfirmationError(message);
      toast.error(message);
    } finally { setBusy(false); }
  }

  const openPassword = (account: User) => {
    setPasswordErrors({}); setPasswords({ new_password: "", confirm_new_password: "" }); setPasswordUser(account);
  };
  const openConfirmation = (kind: "status" | "delete", account: User) => {
    setConfirmationError(""); setConfirmation({ kind, account });
  };
  const statusAction = confirmation?.account.is_active ? "Disable" : "Enable";

  const columns: Column<User>[] = [
    { key: "email", header: "Email", render: (account) => account.email },
    { key: "full_name", header: "Full name", render: (account) => account.full_name },
    { key: "phone", header: "Phone", render: (account) => account.phone || "—" },
    { key: "created", header: "Created", render: (account) => formatDate(account.created_at) },
    { key: "updated", header: "Updated", render: (account) => formatDate(account.updated_at) },
    { key: "role", header: "Role", render: (account) => roleLabel(account.role) },
    { key: "status", header: "Status", render: (account) => <Badge className={account.is_active ? "badge-active" : "badge-disabled"}>{account.is_active ? "Active" : "Disabled"}</Badge> },
    { key: "action", header: "Action", render: (account) => <AccountActions account={account} onPassword={() => openPassword(account)} onStatus={() => openConfirmation("status", account)} onDelete={() => openConfirmation("delete", account)} /> },
  ];

  return <section className="page-stack">
    <div className="page-header"><div><h1>Accounts</h1><p>Manage Teacher and Student access.</p></div>
      <Link className="button" to="/admin/users/new">Create User</Link>
    </div>
    <Card><form className="filters" noValidate onSubmit={search}>
      <div className="filters-row filters-search">
        <div className="filters-primary">
          <Field id="account-search" label="Search accounts" placeholder="Name, email or phone" value={draft.q ?? ""} onChange={(event) => field("q", event.target.value)} />
          <Select id="account-role" label="Role" value={draft.role ?? ""} onChange={(event) => field("role", event.target.value)}><option value="">All</option><option value="TEACHER">Teacher</option><option value="STUDENT">Student</option></Select>
        </div>
        <Button type="submit">Search</Button>
      </div>
      <div className="filters-row filters-dates">
        <Field id="created-from" label="Created from" type="date" value={draft.created_from ?? ""} onChange={(event) => field("created_from", event.target.value)} />
        <Field id="created-to" label="Created to" type="date" value={draft.created_to ?? ""} onChange={(event) => field("created_to", event.target.value)} />
        <Field id="updated-from" label="Updated from" type="date" value={draft.updated_from ?? ""} onChange={(event) => field("updated_from", event.target.value)} />
        <Field id="updated-to" label="Updated to" type="date" value={draft.updated_to ?? ""} onChange={(event) => field("updated_to", event.target.value)} />
      </div>
    </form></Card>
    {loading && !data ? <Spinner label="Loading accounts" /> : failure ? <Alert>{failure} <button onClick={() => void load()}>Retry</button></Alert> :
      data?.results.length === 0 ? <EmptyState>No accounts found.</EmptyState> :
        data && <><DataTable columns={columns} data={data.results} rowKey={(account) => account.id} />
        <Pagination label="Accounts pagination" page={pageNumber} count={data.count} onChange={setPageNumber} /></>}

    {passwordUser &&<Dialog open onClose={() => setPasswordUser(undefined)} title="Change password"><form noValidate onSubmit={setPassword}>
      <p className="muted">Choose a new password for <strong>{passwordUser.email}</strong>. The user will need it to sign in.</p>
      <PasswordField id="admin-new-password" label="New password" required autoComplete="new-password" hint="At least 8 characters." value={passwords.new_password} onChange={(event) => setPasswords({ ...passwords, new_password: event.target.value })} error={passwordErrors.new_password?.[0]} />
      <PasswordField id="admin-confirm-password" label="Confirm new password" required autoComplete="new-password" value={passwords.confirm_new_password} onChange={(event) => setPasswords({ ...passwords, confirm_new_password: event.target.value })} error={passwordErrors.confirm_new_password?.[0]} />
      <div className="dialog-actions">
        <Button type="button" className="button-secondary" disabled={busy} onClick={() => setPasswordUser(undefined)}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Set password"}</Button>
      </div>
    </form></Dialog>}
    {confirmation && <Dialog open onClose={() => setConfirmation(undefined)} title={confirmation.kind === "delete" ? "Delete account" : `${statusAction} account`}>
      <p>{confirmation.kind === "delete" ? `This permanently hides ${confirmation.account.email} from the accounts list.` : `${statusAction} access for ${confirmation.account.email}?`}</p>
      {confirmationError && <Alert>{confirmationError}</Alert>}
      <div className="dialog-actions">
        <Button className="button-secondary" disabled={busy} onClick={() => setConfirmation(undefined)}>Cancel</Button>
        <Button className={confirmation.kind === "delete" || confirmation.account.is_active ? "button-danger" : ""} disabled={busy} onClick={() => void confirmMutation()}>{confirmation.kind === "delete" ? "Delete account" : `${statusAction} account`}</Button>
      </div>
    </Dialog>}
  </section>;
}
