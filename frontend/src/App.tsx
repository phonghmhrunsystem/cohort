import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireRole } from "./auth/RequireRole";
import { AppShell } from "./components/AppShell";
import { Spinner } from "./components/Spinner";
import { ToastProvider } from "./components/Toast";
import { ChangePasswordPage } from "./pages/account/ChangePasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";
import { AdminUserCreatePage } from "./pages/admin/users/AdminUserCreatePage";
import { AdminUserEditPage } from "./pages/admin/users/AdminUserEditPage";
import { AdminUsersPage } from "./pages/admin/users/AdminUsersPage";
import { AdminUserViewPage } from "./pages/admin/users/AdminUserViewPage";
import { ProfileEditPage } from "./pages/account/ProfileEditPage";
import { ProfilePage } from "./pages/account/ProfilePage";
import { AdminClassCreatePage } from "./pages/admin/classes/AdminClassCreatePage";
import { AdminClassEditPage } from "./pages/admin/classes/AdminClassEditPage";
import { AdminClassesPage } from "./pages/admin/classes/AdminClassesPage";
import { AdminClassViewPage } from "./pages/admin/classes/AdminClassViewPage";
import { ClassStudentViewPage } from "./pages/classes/ClassStudentViewPage";
import { StudentClassesPage } from "./pages/student/StudentClassesPage";
import { StudentClassPage } from "./pages/student/StudentClassPage";
import { StudentAssignmentPage } from "./pages/student/StudentAssignmentPage";
import { TeacherClassesPage } from "./pages/teacher/TeacherClassesPage";
import { TeacherClassPage } from "./pages/teacher/TeacherClassPage";
import { TeacherGradebookPage } from "./pages/teacher/TeacherGradebookPage";
import { TeacherAssignmentPage } from "./pages/teacher/TeacherAssignmentPage";
import { TeacherGradePage } from "./pages/teacher/TeacherGradePage";

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
      <Route path="/notifications" element={<Placeholder title="Notifications" />} />
      <Route element={<RequireRole roles={["TEACHER"]} />}>
        <Route path="/teacher/classes" element={<TeacherClassesPage />} />
        <Route path="/teacher/classes/:classId" element={<TeacherClassPage />} />
        <Route path="/teacher/classes/:classId/gradebook" element={<TeacherGradebookPage />} />
        <Route path="/teacher/classes/:classId/students/:studentId" element={<ClassStudentViewPage />} />
        <Route path="/teacher/assignments/:assignmentId" element={<TeacherAssignmentPage />} />
        <Route path="/teacher/assignments/:assignmentId/grade/:submissionId" element={<TeacherGradePage />} />
      </Route>
      <Route element={<RequireRole roles={["STUDENT"]} />}>
        <Route path="/student/classes" element={<StudentClassesPage />} />
        <Route path="/student/classes/:classId" element={<StudentClassPage />} />
        <Route path="/student/assignments/:assignmentId" element={<StudentAssignmentPage />} />
      </Route>
      <Route element={<RequireRole roles={["ADMIN"]} />}>
        <Route path="/audit" element={<Placeholder title="Audit" />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/admin/users/new" element={<AdminUserCreatePage />} />
        <Route path="/admin/users/:userId" element={<AdminUserViewPage />} />
        <Route path="/admin/users/:userId/edit" element={<AdminUserEditPage />} />
        <Route path="/admin/classes" element={<AdminClassesPage />} />
        <Route path="/admin/classes/new" element={<AdminClassCreatePage />} />
        <Route path="/admin/classes/:classId" element={<AdminClassViewPage />} />
        <Route path="/admin/classes/:classId/edit" element={<AdminClassEditPage />} />
        <Route path="/admin/classes/:classId/students/:studentId" element={<ClassStudentViewPage />} />
      </Route>
    </Route></Route>
    <Route path="/" element={<Navigate replace to="/dashboard" />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes></AuthProvider></ToastProvider></BrowserRouter>;
}
