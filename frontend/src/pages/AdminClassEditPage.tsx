import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ClassForm, classFormErrors, classFormPayload, classFormValue, type ClassFormValue } from "../components/ClassForm";
import { Spinner } from "../components/Spinner";
import { request, usersPath } from "../lib/api";
import { ApiFailure } from "../lib/errors";
import type { ClassRow, FieldErrors, Page, User } from "../types";

export function AdminClassEditPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [class_, setClass] = useState<ClassRow>();
  const [draft, setDraft] = useState<ClassFormValue>();
  const [teachers, setTeachers] = useState<{ id: number; full_name: string }[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const token = () => sessionStorage.getItem("access_token") ?? undefined;

  useEffect(() => {
    request<ClassRow>(`/classes/${classId}`, { token: token() })
      .then((value) => { if (value) { setClass(value); setDraft(classFormValue(value)); } })
      .catch((error) => setFailure(error instanceof ApiFailure && error.status === 404 ? "Class not found." : "Unable to load class."));
    request<Page<User>>(usersPath({ role: "TEACHER" }), { token: token() })
      .then((page) => setTeachers((page?.results ?? []).filter((user) => user.is_active)));
  }, [classId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setFailure("");
    const invalid = classFormErrors(draft);
    if (Object.keys(invalid).length) return setErrors(invalid);
    setErrors({}); setBusy(true);
    try {
      await request(`/classes/${classId}`, { method: "PATCH", token: token(), body: classFormPayload(draft) });
      navigate(`/admin/classes/${classId}`);
    } catch (error) {
      if (error instanceof ApiFailure && error.fields) setErrors(error.fields);
      else setFailure(error instanceof Error ? error.message : "Unable to save class.");
    } finally { setBusy(false); }
  }

  if (failure && !class_) return <Alert>{failure}</Alert>;
  if (!class_ || !draft) return <Spinner label="Loading class" />;
  return <section className="page-stack">
    <div className="page-header"><h1>Edit Class</h1></div>
    <Card><form noValidate onSubmit={save}>
      {failure && <Alert>{failure}</Alert>}
      <ClassForm prefix="edit" value={draft} onChange={setDraft} errors={errors} teachers={teachers} />
      <div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button><Link to={`/admin/classes/${classId}`}>Cancel</Link></div>
    </form></Card>
  </section>;
}
