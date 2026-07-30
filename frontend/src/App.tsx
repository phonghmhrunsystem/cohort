import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireRole } from "./auth/RequireRole";
import { AppShell } from "./components/AppShell";
import { Spinner } from "./components/Spinner";
import { ToastProvider } from "./components/Toast";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { AdminUserCreatePage } from "./pages/AdminUserCreatePage";
import { AdminUserEditPage } from "./pages/AdminUserEditPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { AdminUserViewPage } from "./pages/AdminUserViewPage";
import { ProfileEditPage } from "./pages/ProfileEditPage";
import { ProfilePage } from "./pages/ProfilePage";

function Placeholder({ title }: { title: string }) { return <h1>{title}</h1>; }

function ProtectedShell() { return <AppShell />; }

function RedirectForcedUser() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Loading account" />;
  return user?.must_change_password ? <Navigate replace to="/change-password" /> : <Outlet />;
}

export function App() {
  return <BrowserRouter><ToastProvider><AuthProvider><Routes>
    <Route element={<RedirectForcedUser />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
    </Route>
    <Route element={<RequireAuth allowForced />}><Route element={<ProtectedShell />}>
      <Route path="/change-password" element={<ChangePasswordPage />} />
    </Route></Route>
    <Route element={<RequireAuth />}><Route element={<ProtectedShell />}>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/profile/edit" element={<ProfileEditPage />} />
      <Route path="/classes/*" element={<Placeholder title="Classes" />} />
      <Route path="/notifications" element={<Placeholder title="Notifications" />} />
      <Route element={<RequireRole roles={["ADMIN"]} />}>
        <Route path="/audit" element={<Placeholder title="Audit" />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/admin/users/new" element={<AdminUserCreatePage />} />
        <Route path="/admin/users/:userId" element={<AdminUserViewPage />} />
        <Route path="/admin/users/:userId/edit" element={<AdminUserEditPage />} />
      </Route>
    </Route></Route>
    <Route path="/" element={<Navigate replace to="/dashboard" />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes></AuthProvider></ToastProvider></BrowserRouter>;
}
