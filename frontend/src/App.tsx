import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireRole } from "./auth/RequireRole";
import { AppShell } from "./components/AppShell";
import { Spinner } from "./components/Spinner";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";

function Placeholder({ title }: { title: string }) { return <h1>{title}</h1>; }

function ProtectedShell() { return <AppShell />; }

function RedirectForcedUser() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Loading account" />;
  return user?.must_change_password ? <Navigate replace to="/change-password" /> : <Outlet />;
}

export function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route element={<RedirectForcedUser />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
    </Route>
    <Route element={<RequireAuth allowForced />}><Route path="/change-password" element={<ChangePasswordPage />} /></Route>
    <Route element={<RequireAuth />}><Route element={<ProtectedShell />}>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/profile" element={<Placeholder title="Profile" />} />
      <Route path="/profile/edit" element={<Placeholder title="Edit profile" />} />
      <Route path="/classes/*" element={<Placeholder title="Classes" />} />
      <Route element={<RequireRole roles={["ADMIN"]} />}><Route path="/admin/users/*" element={<Placeholder title="Accounts" />} /></Route>
    </Route></Route>
    <Route path="/" element={<Navigate replace to="/dashboard" />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes></AuthProvider></BrowserRouter>;
}
