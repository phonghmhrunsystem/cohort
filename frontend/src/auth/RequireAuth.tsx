import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "./AuthProvider";
import { Spinner } from "../components/Spinner";

export function RequireAuth({ allowForced = false }: { allowForced?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Loading account" />;
  if (!user) return <Navigate replace to="/login" />;
  if (user.must_change_password && !allowForced) return <Navigate replace to="/change-password" />;
  return <Outlet />;
}
