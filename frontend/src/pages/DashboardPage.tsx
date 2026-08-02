import { useEffect, useState } from "react";

import { Alert } from "../components/Alert";
import { Spinner } from "../components/Spinner";
import { request } from "../lib/api";
import type { DashboardData } from "../types";
import { AdminDashboardView } from "./dashboard/AdminDashboardView";
import { StudentDashboardView } from "./dashboard/StudentDashboardView";
import { TeacherDashboardView } from "./dashboard/TeacherDashboardView";

export function DashboardPage() {
  const [data, setData] = useState<DashboardData>();
  const [failure, setFailure] = useState("");
  useEffect(() => {
    request<DashboardData>("/dashboard", { token: sessionStorage.getItem("access_token") ?? undefined })
      .then((payload) => payload && setData(payload))
      .catch((error) => setFailure(error instanceof Error ? error.message : "Unable to load the dashboard."));
  }, []);
  if (failure) return <Alert>{failure}</Alert>;
  if (!data) return <Spinner label="Loading dashboard" />;
  if (data.role === "ADMIN") return <AdminDashboardView data={data} />;
  if (data.role === "TEACHER") return <TeacherDashboardView data={data} />;
  return <StudentDashboardView data={data} />;
}
