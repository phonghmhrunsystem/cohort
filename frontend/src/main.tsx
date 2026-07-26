import { createRoot } from "react-dom/client";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { LoginPage } from "./pages/LoginPage";
import "./styles.css";

const page = location.pathname === "/admin/users" ? <AdminUsersPage /> : location.pathname === "/admin/audit-logs" ? <AuditLogPage /> : <LoginPage />;

createRoot(document.getElementById("root")!).render(page);
