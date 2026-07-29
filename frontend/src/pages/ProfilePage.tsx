import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { Card } from "../components/Card";
import { Info } from "./AdminUserViewPage";
import { roleLabel } from "./AdminUsersPage";

export function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;
  return <section className="page-stack">
    <div className="page-header"><div><h1>Profile</h1><p>Personal details and account identity.</p></div><div className="form-actions"><Link to="/change-password">Change password</Link><Link className="button" to="/profile/edit">Edit profile</Link></div></div>
    <Card><h2>Identity</h2><dl className="identity-grid"><Info label="Email" value={user.email} /><Info label="Role" value={roleLabel(user.role)} /></dl><p className="muted">Email and role are managed by an administrator.</p></Card>
    <Card><h2>Personal information</h2><dl className="identity-grid"><Info label="Full name" value={user.full_name} /><Info label="Phone" value={user.phone} /><Info label="Date of birth" value={user.date_of_birth} /><Info label="Gender" value={user.gender} /><Info label="Hometown" value={user.hometown} /><Info label="Address" value={user.address} /></dl></Card>
  </section>;
}
