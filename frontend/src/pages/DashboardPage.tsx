import { useAuth } from "../auth/AuthProvider";
import { Card } from "../components/Card";

export function DashboardPage() {
  const { user } = useAuth();
  return <Card><h1>Dashboard</h1><p>{user?.role === "ADMIN" ? "Manage accounts and classes." : "Start managing your classes."}</p></Card>;
}
