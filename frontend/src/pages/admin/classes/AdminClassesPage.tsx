import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { Alert } from "../../../components/Alert";
import { Badge } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { Dialog } from "../../../components/Dialog";
import { EmptyState } from "../../../components/EmptyState";
import { Field } from "../../../components/Field";
import { EyeIcon, IconButton, IconLinkButton, PowerIcon } from "../../../components/IconButton";
import { Pagination } from "../../../components/Pagination";
import { Spinner } from "../../../components/Spinner";
import { DataTable, type Column } from "../../../components/Table";
import { useToast } from "../../../components/Toast";
import { classesPath, request } from "../../../lib/api";
import { formatDate } from "../../../lib/format";
import type { ClassFilters, ClassRow, Page } from "../../../types";

const token = () => sessionStorage.getItem("access_token") ?? undefined;

export function AdminClassesPage() {
  const [draft, setDraft] = useState<ClassFilters>({});
  const [submitted, setSubmitted] = useState<ClassFilters>({});
  const [pageNumber, setPageNumber] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<Page<ClassRow>>();
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [confirmation, setConfirmation] = useState<ClassRow>();
  const [busy, setBusy] = useState(false);
  const requestGeneration = useRef(0);
  const toast = useToast();

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true); setFailure("");
    try {
      const result = await request<Page<ClassRow>>(classesPath({ ...submitted, page: pageNumber === 1 ? undefined : pageNumber }), { token: token() });
      if (generation === requestGeneration.current && result) setData(result);
    } catch (error) {
      if (generation === requestGeneration.current) setFailure(error instanceof Error ? error.message : "Unable to load classes.");
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [submitted, pageNumber, refreshKey]);

  useEffect(() => { void load(); }, [load]);
  const refresh = () => setRefreshKey((value) => value + 1);
  const search = (event: FormEvent) => { event.preventDefault(); setPageNumber(1); setSubmitted({ ...draft }); };
  const field = (name: keyof ClassFilters, value: string) => setDraft({ ...draft, [name]: value || undefined });

  const canDisable = (row: ClassRow) => new Date(row.starts_at) > new Date();

  const columns: Column<ClassRow>[] = [
    { key: "name", header: "Name", render: (row) => row.name },
    { key: "teacher", header: "Teacher", render: (row) => row.teacher.full_name },
    { key: "starts", header: "Starts", render: (row) => formatDate(row.starts_at) },
    { key: "ends", header: "Ends", render: (row) => formatDate(row.ends_at) },
    { key: "students", header: "Students", render: (row) => row.student_count },
    { key: "status", header: "Status", render: (row) => <Badge className={row.is_active ? "badge-active" : "badge-disabled"}>{row.is_active ? "Active" : "Disabled"}</Badge> },
    { key: "action", header: "Action", render: (row) => <div className="row-actions">
      <IconLinkButton to={`/admin/classes/${row.id}`} icon={<EyeIcon />} label="View" />
      <IconButton
        icon={<PowerIcon />}
        label={row.is_active ? "Disable" : "Enable"}
        variant={row.is_active ? "danger" : "active"}
        disabled={row.is_active && !canDisable(row)}
        title={row.is_active && !canDisable(row) ? "Class has already started." : undefined}
        onClick={() => setConfirmation(row)}
      />
    </div> },
  ];

  async function toggleStatus() {
    if (!confirmation) return;
    setBusy(true);
    try {
      await request(`/classes/${confirmation.id}/status`, { method: "PATCH", token: token(), body: { is_active: !confirmation.is_active } });
      toast.success(confirmation.is_active ? `Disabled ${confirmation.name}.` : `Enabled ${confirmation.name}.`);
      setConfirmation(undefined); refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update class.");
    } finally { setBusy(false); }
  }

  return <section className="page-stack">
    <div className="page-header"><div><h1>Classes</h1></div>
      <Link className="button" to="/admin/classes/new">Create Class</Link>
    </div>
    <Card><form className="filters" noValidate onSubmit={search}>
      <div className="filters-row filters-search">
        <div className="filters-primary">
          <Field id="class-search-name" label="Class name" value={draft.q ?? ""} onChange={(event) => field("q", event.target.value)} />
          <Field id="class-search-teacher" label="Teacher name" value={draft.teacher ?? ""} onChange={(event) => field("teacher", event.target.value)} />
        </div>
        <Button type="submit">Search</Button>
      </div>
    </form></Card>
    {loading && !data ? <Spinner label="Loading classes" /> : failure ? <Alert>{failure} <button onClick={() => void load()}>Retry</button></Alert> :
      data?.results.length === 0 ? <EmptyState>No classes found.</EmptyState> :
        data && <><DataTable columns={columns} data={data.results} rowKey={(row) => row.id} />
        <Pagination label="Classes pagination" page={pageNumber} count={data.count} onChange={setPageNumber} /></>}
    {confirmation && <Dialog open onClose={() => setConfirmation(undefined)} title={confirmation.is_active ? "Disable class" : "Enable class"}>
      <p>{confirmation.is_active ? `Disable ${confirmation.name}? Students and the teacher will lose access.` : `Enable ${confirmation.name}?`}</p>
      <div className="dialog-actions">
        <Button className="button-secondary" disabled={busy} onClick={() => setConfirmation(undefined)}>Cancel</Button>
        <Button className={confirmation.is_active ? "button-danger" : ""} disabled={busy} onClick={() => void toggleStatus()}>{confirmation.is_active ? "Disable" : "Enable"}</Button>
      </div>
    </Dialog>}
  </section>;
}
