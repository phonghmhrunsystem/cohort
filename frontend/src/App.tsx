import { useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireRole } from "./auth/RequireRole";
import { AppShell } from "./components/AppShell";
import { Card } from "./components/Card";
import { Field } from "./components/Field";
import { DashboardPage } from "./pages/DashboardPage";
import { NotFoundPage } from "./pages/NotFoundPage";

function PublicPage({ title, password = false }: { title: string; password?: boolean }) {
  const [shown, setShown] = useState(false);
  return <main className="public-page"><Card><h1>{title}</h1>{password && <Field id="password" label="Password" type={shown ? "text" : "password"} />}{password && <button aria-label={shown ? "Hide password" : "Show password"} onClick={() => setShown(!shown)}>{shown ? "Hide" : "Show"}</button>}{title === "Sign in" && <Link to="/forgot-password">Forgot password?</Link>}</Card></main>;
}

function Placeholder({ title }: { title: string }) { return <h1>{title}</h1>; }

function ProtectedShell() { return <AppShell />; }

export function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/login" element={<PublicPage title="Sign in" password />} />
    <Route path="/forgot-password" element={<PublicPage title="Forgot password" />} />
    <Route path="/reset-password" element={<PublicPage title="Reset password" password />} />
    <Route element={<RequireAuth allowForced />}><Route path="/change-password" element={<PublicPage title="Change password" password />} /></Route>
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
