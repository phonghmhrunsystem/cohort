import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { genderLabel } from "../../../components/AccountForm";
import { Alert } from "../../../components/Alert";
import { Badge } from "../../../components/Badge";
import { Card } from "../../../components/Card";
import { Info } from "../../../components/Info";
import { Spinner } from "../../../components/Spinner";
import { request } from "../../../lib/api";
import { ApiFailure } from "../../../lib/errors";
import { formatDate, roleLabel } from "../../../lib/format";
import type { User } from "../../../types";

export function AdminUserViewPage() {
  const { userId } = useParams();
  const [account, setAccount] = useState<User>();
  const [failure, setFailure] = useState("");
  useEffect(() => {
    request<User>(`/users/${userId}`, { token: sessionStorage.getItem("access_token") ?? undefined })
      .then((value) => setAccount(value))
      .catch((error) => setFailure(error instanceof ApiFailure && error.status === 404 ? "Account not found." : error instanceof Error ? error.message : "Unable to load account."));
  }, [userId]);
  if (failure) return <Alert>{failure}</Alert>;
  if (!account) return <Spinner label="Loading account" />;
  return <section className="page-stack">
    <div className="page-header"><h1>User Detail</h1><Link className="button" to={`/admin/users/${account.id}/edit`}>Edit User</Link></div>
    <Card><h2 className="section-title">Account access</h2><dl className="identity-grid">
      <Info label="Email" value={account.email} />
      <Info label="Role" value={roleLabel(account.role)} />
      <Info label="Status" value={<Badge className={account.is_active ? "badge-active" : "badge-disabled"}>{account.is_active ? "Active" : "Disabled"}</Badge>} />
    </dl></Card>
    <Card><h2 className="section-title">Personal information</h2><dl className="identity-grid">
      <Info label="Full name" value={account.full_name} />
      <Info label="Phone" value={account.phone} />
      <Info label="Date of birth" value={formatDate(account.date_of_birth)} />
      <Info label="Gender" value={genderLabel(account.gender)} />
    </dl></Card>
    <Card><h2 className="section-title">Location</h2><dl className="identity-grid">
      <Info label="Hometown" value={account.hometown} />
      <Info label="Address" value={account.address} wide />
    </dl></Card>
    <Card><h2 className="section-title">Record</h2><dl className="identity-grid">
      <Info label="Created" value={formatDate(account.created_at)} />
      <Info label="Last updated" value={formatDate(account.updated_at)} />
    </dl></Card>
    <Link to="/admin/users">Back to accounts</Link>
  </section>;
}
