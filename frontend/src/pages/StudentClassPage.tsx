import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Alert } from "../components/Alert";
import { Card } from "../components/Card";
import { Spinner } from "../components/Spinner";
import { request } from "../lib/api";
import type { ClassRow } from "../types";
import { formatDate } from "./AdminUsersPage";

export function StudentClassPage() {
  const { classId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "assignments" ? "assignments" : "resources";
  const [class_, setClass] = useState<ClassRow>();
  const [failure, setFailure] = useState("");
  useEffect(() => {
    request<ClassRow>(`/classes/${classId}`, { token: sessionStorage.getItem("access_token") ?? undefined })
      .then((value) => value && setClass(value))
      .catch((error) => setFailure(error instanceof Error ? error.message : "Unable to load class."));
  }, [classId]);
  if (failure) return <Alert>{failure}</Alert>;
  if (!class_) return <Spinner label="Loading class" />;
  const progress = class_.assignment_count != null
    ? `Tiến độ: ${class_.graded_count}/${class_.assignment_count} đã chấm${class_.next_due_at ? ` · Hạn ${formatDate(class_.next_due_at)}` : ""}`
    : null;
  return <section className="page-stack">
    <Link to="/student/classes">‹ Back</Link>
    <h1>{class_.name}</h1>
    {progress && <p>{progress}</p>}
    <p>Giáo viên: {class_.teacher.full_name}</p>
    <div className="tabs" role="tablist">
      <button role="tab" aria-selected={tab === "resources"} onClick={() => setSearchParams({ tab: "resources" })}>Class resources</button>
      <button role="tab" aria-selected={tab === "assignments"} onClick={() => setSearchParams({ tab: "assignments" })}>Assignments</button>
    </div>
    {tab === "resources" && <Card><p className="muted">Class resources — see 07-notifications-and-resources.</p></Card>}
    {tab === "assignments" && <Card><p className="muted">Assignments — see 03-assignments-and-rubrics / 04-submissions.</p></Card>}
  </section>;
}
