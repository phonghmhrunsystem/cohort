import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Alert } from "../../components/Alert";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { Field } from "../../components/Field";
import { Button } from "../../components/Button";
import { EyeIcon, IconLinkButton } from "../../components/IconButton";
import { Spinner } from "../../components/Spinner";
import { Table } from "../../components/Table";
import { classesPath, request } from "../../lib/api";
import type { ClassRow, Page } from "../../types";

export function TeacherClassesPage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [data, setData] = useState<Page<ClassRow>>();
  const [failure, setFailure] = useState("");
  const token = () => sessionStorage.getItem("access_token") ?? undefined;

  const load = useCallback(() => {
    request<Page<ClassRow>>(classesPath({ q: submitted || undefined, page: pageNumber === 1 ? undefined : pageNumber }), { token: token() })
      .then((value) => value && setData(value))
      .catch((error) => setFailure(error instanceof Error ? error.message : "Unable to load classes."));
  }, [submitted, pageNumber]);
  useEffect(() => { load(); }, [load]);
  const search = (event: FormEvent) => { event.preventDefault(); setPageNumber(1); setSubmitted(query); };

  return <section className="page-stack">
    <div className="page-header"><h1>My Classes</h1></div>
    <Card><form className="filters" noValidate onSubmit={search}><div className="filters-row filters-search"><Field id="teacher-class-search" label="Search Classes" value={query} onChange={(event) => setQuery(event.target.value)} /><Button type="submit">Search</Button></div></form></Card>
    {failure ? <Alert>{failure}</Alert> : !data ? <Spinner label="Loading classes" /> :
      data.results.length === 0 ? <EmptyState>No classes assigned.</EmptyState> : <><Table><thead><tr><th>Name</th><th>Students</th><th>Action</th></tr></thead>
        <tbody>{data.results.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.student_count}</td><td><div className="row-actions"><IconLinkButton to={`/teacher/classes/${row.id}`} icon={<EyeIcon />} label="View" /></div></td></tr>)}</tbody>
      </Table><nav className="pagination" aria-label="Classes pagination"><button disabled={!data.previous} onClick={() => setPageNumber((v) => v - 1)}>Previous</button><span>Page {pageNumber}</span><button disabled={!data.next} onClick={() => setPageNumber((v) => v + 1)}>Next</button></nav></>}
  </section>;
}
