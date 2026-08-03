import { Navigate, Outlet } from "react-router-dom";

import { roleHome, useAuth } from "./AuthProvider";
import type { Role } from "../types";

export function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth();
  return user && roles.includes(user.role) ? <Outlet /> : <Navigate replace to={roleHome()} />;
}
