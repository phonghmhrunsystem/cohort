import { createRoot } from "react-dom/client";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { CohortPage } from "./pages/CohortPage";
import { LoginPage } from "./pages/LoginPage";
import { StudentCohortsPage } from "./pages/StudentCohortsPage";
import { TeacherCohortsPage } from "./pages/TeacherCohortsPage";
import "./styles.css";

const page = location.pathname === "/admin/users" ? <AdminUsersPage /> : location.pathname === "/admin/audit-logs" ? <AuditLogPage /> : location.pathname === "/teacher/cohorts" ? <TeacherCohortsPage /> : location.pathname === "/student/cohorts" ? <StudentCohortsPage /> : /^\/cohorts\/\d+$/.test(location.pathname) ? <CohortPage /> : <LoginPage />;

createRoot(document.getElementById("root")!).render(page);
