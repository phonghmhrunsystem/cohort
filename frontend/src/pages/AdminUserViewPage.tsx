import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Alert } from "../components/Alert";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { Spinner } from "../components/Spinner";
import { request } from "../lib/api";
import { ApiFailure } from "../lib/errors";
import type { User } from "../types";
import { roleLabel } from "./AdminUsersPage";

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
  return <section className="page-stack"><div className="page-header"><div><h1>{account.full_name}</h1><p>{account.email}</p></div><Link className="button" to={`/admin/users/${account.id}/edit`}>Edit account</Link></div>
    <Card><div className="identity-grid"><Info label="Role" value={roleLabel(account.role)} /><Info label="Status" value={<Badge>{account.is_active ? "Active" : "Disabled"}</Badge>} /><Info label="Phone" value={account.phone} /><Info label="Date of birth" value={account.date_of_birth} /><Info label="Gender" value={account.gender} /><Info label="Hometown" value={account.hometown} /><Info label="Address" value={account.address} /></div></Card>
    <Link to="/admin/users">Back to accounts</Link>
  </section>;
}

export function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt>{label}</dt><dd>{value || "—"}</dd></div>;
}
