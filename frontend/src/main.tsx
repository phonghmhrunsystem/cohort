import { createRoot } from "react-dom/client";
import { AppShell } from "./AppShell";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { AdminClassPage } from "./pages/AdminClassPage";
import { AdminClassesPage } from "./pages/AdminClassesPage";
import { AssignmentPage } from "./pages/AssignmentPage";
import { GradePage } from "./pages/GradePage";
import { LoginPage } from "./pages/LoginPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { PasswordResetRequestsPage } from "./pages/PasswordResetRequestsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ResultPage } from "./pages/ResultPage";
import { StudentClassPage } from "./pages/StudentClassPage";
import { StudentClassesPage } from "./pages/StudentClassesPage";
import { TeacherClassPage } from "./pages/TeacherClassPage";
import { TeacherGradebookPage } from "./pages/TeacherGradebookPage";
import { TeacherClassesPage } from "./pages/TeacherClassesPage";
import { ApiFailure } from "./api";
import { getCurrentUser } from "./auth";
import { accessToken, canAccess, clearSession, redirectToLogin, roleHome } from "./session";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

function pageFor(path: string) {
  const assignment = /^\/(teacher|student)\/assignments\/(\d+)$/.exec(path);
  const grade = /^\/teacher\/assignments\/(\d+)\/submissions\/(\d+)\/grade$/.exec(path);
  const result = /^\/student\/assignments\/(\d+)\/result$/.exec(path);
  return path === "/profile" ? <ProfilePage /> : path === "/admin/users" ? <AdminUsersPage /> : path === "/admin/password-reset-requests" ? <PasswordResetRequestsPage /> : path === "/admin/audit-logs" ? <AuditLogPage /> : path === "/admin/classes" ? <AdminClassesPage /> : /^\/admin\/classes\/\d+$/.test(path) ? <AdminClassPage /> : path === "/teacher/classes" ? <TeacherClassesPage /> : /^\/teacher\/classes\/\d+\/gradebook$/.test(path) ? <TeacherGradebookPage /> : /^\/teacher\/classes\/\d+$/.test(path) ? <TeacherClassPage /> : path === "/student/classes" ? <StudentClassesPage /> : /^\/student\/classes\/\d+$/.test(path) ? <StudentClassPage /> : grade ? <GradePage assignmentId={Number(grade[1])} submissionId={Number(grade[2])} /> : result ? <ResultPage assignmentId={Number(result[1])} /> : assignment ? <AssignmentPage assignmentId={Number(assignment[2])} role={assignment[1].toUpperCase() as "TEACHER" | "STUDENT"} /> : undefined;
}

async function render() {
  const path = location.pathname;
  if (path === "/login") {
    if (accessToken()) {
      try {
        location.assign(roleHome((await getCurrentUser()).role));
        return;
      } catch (error) {
        if ((error as ApiFailure).status !== 401) clearSession();
      }
    }
    root.render(<LoginPage />);
    return;
  }
  if (path === "/change-password" && accessToken()) { root.render(<ChangePasswordPage />); return; }

  const page = pageFor(path);
  if (!page || !accessToken()) return redirectToLogin();
  try {
    const user = await getCurrentUser();
    if (user.must_change_password) { location.assign("/change-password"); return; }
    if (!canAccess(path, user.role)) return redirectToLogin();
    root.render(<AppShell user={user}>{page}</AppShell>);
  } catch (error) {
    if ((error as ApiFailure).status !== 401) redirectToLogin();
  }
}

void render();
