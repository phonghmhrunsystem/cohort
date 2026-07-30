import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { Field } from "../components/Field";
import { Spinner } from "../components/Spinner";
import { Table } from "../components/Table";
import { classStudentsPath, request } from "../lib/api";
import type { ClassRow, RosterResponse } from "../types";

export function TeacherClassPage() {
  const { classId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "assignments" ? "assignments" : "students";
  const [class_, setClass] = useState<ClassRow>();
  const [roster, setRoster] = useState<RosterResponse>();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [failure, setFailure] = useState("");
  const token = () => sessionStorage.getItem("access_token") ?? undefined;

  useEffect(() => {
    request<ClassRow>(`/classes/${classId}`, { token: token() }).then((value) => value && setClass(value)).catch(() => setFailure("Unable to load class."));
  }, [classId]);

  const loadRoster = useCallback(() => {
    if (!classId) return;
    request<RosterResponse>(classStudentsPath(Number(classId), { q: submitted || undefined, page: pageNumber === 1 ? undefined : pageNumber }), { token: token() })
      .then((value) => value && setRoster(value));
  }, [classId, submitted, pageNumber]);
  useEffect(() => { if (tab === "students") loadRoster(); }, [loadRoster, tab]);

  const search = (event: FormEvent) => { event.preventDefault(); setPageNumber(1); setSubmitted(query); };

  if (failure) return <Alert>{failure}</Alert>;
  if (!class_) return <Spinner label="Loading class" />;
  return <section className="page-stack">
    <Link to="/teacher/classes">‹ Back</Link>
    <h1>{class_.name}</h1>
    <div className="tabs" role="tablist">
      <button role="tab" aria-selected={tab === "students"} onClick={() => setSearchParams({ tab: "students" })}>Students</button>
      <button role="tab" aria-selected={tab === "assignments"} onClick={() => setSearchParams({ tab: "assignments" })}>Assignments</button>
    </div>
    {tab === "students" && roster && <Card>
      <p>Đã ghi danh {roster.enrolled_students} · Đã nộp {roster.submitted_students} · Đã chấm {roster.graded_students}</p>
      <form className="filters" noValidate onSubmit={search}><Field id="teacher-roster-search" label="Search Student" value={query} onChange={(event) => setQuery(event.target.value)} /><Button type="submit">Search</Button></form>
      {roster.students.results.length === 0 ? <EmptyState>No students.</EmptyState> : <><Table><thead><tr><th>Name</th><th>Phone</th><th>Action</th></tr></thead>
        <tbody>{roster.students.results.map((s) => <tr key={s.id}><td>{s.full_name}</td><td>{s.phone || "—"}</td><td><Link to={`/teacher/classes/${classId}/students/${s.id}`}>View</Link></td></tr>)}</tbody>
      </Table><nav className="pagination" aria-label="Students pagination"><button disabled={!roster.students.previous} onClick={() => setPageNumber((v) => v - 1)}>Previous</button><span>Page {pageNumber}</span><button disabled={!roster.students.next} onClick={() => setPageNumber((v) => v + 1)}>Next</button></nav></>}
    </Card>}
    {tab === "assignments" && <Card><p className="muted">Assignments — see 03-assignments-and-rubrics.</p></Card>}
  </section>;
}
