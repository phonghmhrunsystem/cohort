import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { genderLabel } from "../components/AccountForm";
import { Card } from "../components/Card";
import { Info } from "./AdminUserViewPage";
import { formatDate, roleLabel } from "./AdminUsersPage";

export function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;
  return <section className="page-stack">
    <div className="page-header"><h1>Profile</h1><div className="form-actions"><Link to="/change-password">Change password</Link><Link className="button" to="/profile/edit">Edit profile</Link></div></div>
    <Card><h2 className="section-title">Account access</h2><dl className="identity-grid">
      <Info label="Email" value={user.email} />
      <Info label="Role" value={roleLabel(user.role)} />
    </dl></Card>
    <Card><h2 className="section-title">Personal information</h2><dl className="identity-grid">
      <Info label="Full name" value={user.full_name} />
      <Info label="Phone" value={user.phone} />
      <Info label="Date of birth" value={formatDate(user.date_of_birth)} />
      <Info label="Gender" value={genderLabel(user.gender)} />
    </dl></Card>
    <Card><h2 className="section-title">Location</h2><dl className="identity-grid">
      <Info label="Hometown" value={user.hometown} />
      <Info label="Address" value={user.address} wide />
    </dl></Card>
  </section>;
}
