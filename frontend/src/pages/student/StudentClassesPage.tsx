import { useEffect, useState } from "react";

import { Alert } from "../../components/Alert";
import { EmptyState } from "../../components/EmptyState";
import { EyeIcon, IconLinkButton } from "../../components/IconButton";
import { Spinner } from "../../components/Spinner";
import { Table } from "../../components/Table";
import { request } from "../../lib/api";
import type { ClassRow, Page } from "../../types";

export function StudentClassesPage() {
  const [data, setData] = useState<ClassRow[]>();
  const [failure, setFailure] = useState("");
  useEffect(() => {
    request<Page<ClassRow>>("/classes", { token: sessionStorage.getItem("access_token") ?? undefined })
      .then((page) => setData(page?.results ?? []))
      .catch((error) => setFailure(error instanceof Error ? error.message : "Unable to load classes."));
  }, []);
  if (failure) return <Alert>{failure}</Alert>;
  if (!data) return <Spinner label="Loading classes" />;
  return <section className="page-stack">
    <div className="page-header"><h1>My Classes</h1></div>
    {data.length === 0 ? <EmptyState>No classes enrolled.</EmptyState> : <Table><thead><tr><th>Name</th><th>Teacher</th><th>Action</th></tr></thead>
      <tbody>{data.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.teacher.full_name}</td><td><div className="row-actions"><IconLinkButton to={`/student/classes/${row.id}`} icon={<EyeIcon />} label="View" /></div></td></tr>)}</tbody>
    </Table>}
  </section>;
}
