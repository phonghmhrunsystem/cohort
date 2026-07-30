import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { Alert } from "../components/Alert";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { Field } from "../components/Field";
import { Spinner } from "../components/Spinner";
import { Table } from "../components/Table";
import { useToast } from "../components/Toast";
import { classStudentsPath, request } from "../lib/api";
import { ApiFailure } from "../lib/errors";
import type { Candidate, ClassRow, Page, RosterResponse, RosterStudent } from "../types";
import { formatDate } from "./AdminUsersPage";
import { Info } from "./AdminUserViewPage";

const token = () => sessionStorage.getItem("access_token") ?? undefined;

export function AdminClassViewPage() {
  const { classId } = useParams();
  const id = Number(classId);
  const [class_, setClass] = useState<ClassRow>();
  const [roster, setRoster] = useState<RosterResponse>();
  const [rosterQuery, setRosterQuery] = useState("");
  const [rosterSubmitted, setRosterSubmitted] = useState("");
  const [rosterPage, setRosterPage] = useState(1);
  const [failure, setFailure] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [extendDate, setExtendDate] = useState("");
  const toast = useToast();

  const loadClass = useCallback(() => {
    request<ClassRow>(`/classes/${id}`, { token: token() })
      .then((value) => value && setClass(value))
      .catch((error) => setFailure(error instanceof ApiFailure && error.status === 404 ? "Class not found." : "Unable to load class."));
  }, [id]);

  const loadRoster = useCallback(() => {
    request<RosterResponse>(classStudentsPath(id, { q: rosterSubmitted || undefined, page: rosterPage === 1 ? undefined : rosterPage }), { token: token() })
      .then((value) => value && setRoster(value))
      .catch(() => setFailure("Unable to load roster."));
  }, [id, rosterSubmitted, rosterPage]);

  useEffect(() => { loadClass(); }, [loadClass]);
  useEffect(() => { loadRoster(); }, [loadRoster]);

  const search = (event: FormEvent) => { event.preventDefault(); setRosterPage(1); setRosterSubmitted(rosterQuery); };

  async function removeStudent(studentId: number) {
    try {
      await request(`/classes/${id}/enrollments/${studentId}`, { method: "DELETE", token: token() });
      toast.success("Removed from roster.");
      loadRoster();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove student.");
    }
  }

  async function openEditRoster() {
    setEditOpen(true);
    setSelected(new Set((roster?.students.results ?? []).map((s) => s.id)));
    try {
      const all = await request<{ results?: Candidate[] } | Candidate[]>(`/classes/${id}/students?candidates=1`, { token: token() });
      setCandidates(Array.isArray(all) ? all : all?.results ?? []);
    } catch {
      toast.error("Unable to load candidates.");
    }
  }

  async function extendEndDate() {
    try {
      await request(`/classes/${id}`, { method: "PATCH", token: token(), body: { ends_at: extendDate } });
      toast.success("Class end date extended.");
      loadClass();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to extend end date.");
    }
  }

  async function saveRoster() {
    setBusy(true);
    try {
      await request(`/classes/${id}/enrollments`, { method: "PUT", token: token(), body: { student_ids: Array.from(selected) } });
      toast.success("Roster updated.");
      setEditOpen(false); loadRoster();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save roster.");
    } finally { setBusy(false); }
  }

  if (failure) return <Alert>{failure}</Alert>;
  if (!class_) return <Spinner label="Loading class" />;
  const ended = new Date(class_.ends_at) <= new Date();
  const visibleCandidates = candidates.filter((c) => c.full_name.toLowerCase().includes(candidateQuery.toLowerCase()) || c.email.toLowerCase().includes(candidateQuery.toLowerCase()));

  return <section className="page-stack">
    <div className="page-header">
      <h1>Class Detail</h1>
      {ended
        ? <div className="field-adorned">
            <Field id="extend-ends-at" label="Extend end date" type="date" value={extendDate || class_.ends_at.slice(0, 10)} onChange={(event) => setExtendDate(event.target.value)} />
            <Button onClick={() => void extendEndDate()}>Extend end date</Button>
          </div>
        : <Link className="button" to={`/admin/classes/${id}/edit`}>Edit Class</Link>}
    </div>
    <Card><h2 className="section-title">Class details</h2><dl className="identity-grid">
      <Info label="Name" value={class_.name} />
      <Info label="Description" value={class_.description} wide />
      <Info label="Teacher" value={class_.teacher.full_name} />
      <Info label="Starts" value={formatDate(class_.starts_at)} />
      <Info label="Ends" value={formatDate(class_.ends_at)} />
      <Info label="Status" value={<Badge className={class_.is_active ? "badge-active" : "badge-disabled"}>{class_.is_active ? "Active" : "Disabled"}</Badge>} />
    </dl></Card>

    {roster && <Card>
      <div className="page-header"><h2 className="section-title">Students ({roster.enrolled_students})</h2>{!ended && <Button onClick={() => void openEditRoster()}>Edit roster</Button>}</div>
      <form className="filters" noValidate onSubmit={search}><Field id="roster-search" label="Search Students" value={rosterQuery} onChange={(event) => setRosterQuery(event.target.value)} /><Button type="submit">Search</Button></form>
      {roster.students.results.length === 0 ? <EmptyState>No students enrolled.</EmptyState> : <><Table><thead><tr><th>Name</th><th>Quê quán</th><th>Phone</th><th>Enrolled</th><th>Action</th></tr></thead>
        <tbody>{roster.students.results.map((student) => <tr key={student.id}>
          <td>{student.full_name}</td><td>{student.hometown || "—"}</td><td>{student.phone || "—"}</td><td>{formatDate(student.enrolled_at)}</td>
          <td><Link to={`/admin/classes/${id}/students/${student.id}`}>View</Link>{" "}
            {!ended && student.submitted_assignments === 0 && <button onClick={() => void removeStudent(student.id)}>Remove</button>}
          </td>
        </tr>)}</tbody>
      </Table><nav className="pagination" aria-label="Students pagination"><button disabled={!roster.students.previous} onClick={() => setRosterPage((v) => v - 1)}>Previous</button><span>Page {rosterPage}</span><button disabled={!roster.students.next} onClick={() => setRosterPage((v) => v + 1)}>Next</button></nav></>}
    </Card>}

    <Link to="/admin/classes">Back to classes</Link>

    {editOpen && <Dialog open onClose={() => setEditOpen(false)} title="Edit roster">
      <Field id="candidate-search" label="Search Students" value={candidateQuery} onChange={(event) => setCandidateQuery(event.target.value)} />
      <ul className="checkbox-list">{visibleCandidates.map((c) => <li key={c.id}>
        <label><input type="checkbox" checked={selected.has(c.id)} onChange={(event) => {
          const next = new Set(selected);
          if (event.target.checked) next.add(c.id); else next.delete(c.id);
          setSelected(next);
        }} /> {c.full_name} ({c.email})</label>
      </li>)}</ul>
      <div className="dialog-actions">
        <Button className="button-secondary" disabled={busy} onClick={() => setEditOpen(false)}>Cancel</Button>
        <Button disabled={busy} onClick={() => void saveRoster()}>{busy ? "Saving…" : "Save roster"}</Button>
      </div>
    </Dialog>}
  </section>;
}
