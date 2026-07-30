import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { Alert } from "../../components/Alert";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { Info } from "../../components/Info";
import { request } from "../../lib/api";

interface StudentDetail {
  full_name: string; email: string; phone: string | null; hometown: string | null;
  submitted_assignments: number; graded_assignments: number; total_assignments: number;
}

export function ClassStudentViewPage() {
  const { classId, studentId } = useParams();
  const { pathname } = useLocation();
  const classPath = pathname.replace(/\/students\/[^/]+$/, "");
  const [student, setStudent] = useState<StudentDetail>();
  const [failure, setFailure] = useState("");
  useEffect(() => {
    request<StudentDetail>(`/classes/${classId}/students/${studentId}`, { token: sessionStorage.getItem("access_token") ?? undefined })
      .then((value) => value && setStudent(value))
      .catch((error) => setFailure(error instanceof Error ? error.message : "Unable to load student."));
  }, [classId, studentId]);
  if (failure) return <Alert>{failure}</Alert>;
  if (!student) return <Spinner label="Loading student" />;
  return <section className="page-stack">
    <div className="page-header"><h1>{student.full_name}</h1></div>
    <Card><dl className="identity-grid">
      <Info label="Email" value={student.email} />
      <Info label="Phone" value={student.phone} />
      <Info label="Quê quán" value={student.hometown} />
      <Info label="Progress" value={`${student.graded_assignments}/${student.total_assignments} graded, ${student.submitted_assignments} submitted`} />
    </dl></Card>
    <Link className="back-link" to={classPath}>‹ Back to class</Link>
  </section>;
}
