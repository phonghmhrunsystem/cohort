import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ClassForm, classFormErrors, classFormPayload, classFormValue, type ClassFormValue } from "../components/ClassForm";
import { request, usersPath } from "../lib/api";
import { ApiFailure } from "../lib/errors";
import type { ClassRow, FieldErrors, Page, User } from "../types";

export function AdminClassCreatePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ClassFormValue>(classFormValue());
  const [teachers, setTeachers] = useState<{ id: number; full_name: string }[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const token = () => sessionStorage.getItem("access_token") ?? undefined;

  useEffect(() => {
    request<Page<User>>(usersPath({ role: "TEACHER" }), { token: token() })
      .then((page) => setTeachers((page?.results ?? []).filter((user) => user.is_active)));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setFailure("");
    const invalid = classFormErrors(draft);
    if (Object.keys(invalid).length) return setErrors(invalid);
    setErrors({}); setBusy(true);
    try {
      const created = await request<ClassRow>("/classes", { method: "POST", token: token(), body: classFormPayload(draft) });
      if (created) navigate(`/admin/classes/${created.id}`);
    } catch (error) {
      if (error instanceof ApiFailure && error.fields) setErrors(error.fields);
      else setFailure(error instanceof Error ? error.message : "Unable to create class.");
    } finally { setBusy(false); }
  }

  return <section className="page-stack">
    <div className="page-header"><h1>Create Class</h1></div>
    <Card><form noValidate onSubmit={save}>
      {failure && <Alert>{failure}</Alert>}
      <ClassForm prefix="create" value={draft} onChange={setDraft} errors={errors} teachers={teachers} />
      <div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</Button><Link to="/admin/classes">Cancel</Link></div>
    </form></Card>
  </section>;
}
