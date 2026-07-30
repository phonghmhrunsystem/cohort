import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Dialog } from "../../components/Dialog";
import { Field } from "../../components/Field";
import { Spinner } from "../../components/Spinner";
import { request } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import type { Assignment } from "../../types";

const token = () => sessionStorage.getItem("access_token") ?? undefined;

const DEFAULT_TEMPLATE = [
  { title: "Đúng yêu cầu", maximum_score: 40 },
  { title: "Chất lượng", maximum_score: 30 },
  { title: "Trình bày", maximum_score: 30 },
];

type CriterionDraft = { title: string; maximum_score: string };

export function TeacherAssignmentPage() {
  const { assignmentId } = useParams();
  const [assignment, setAssignment] = useState<Assignment>();
  const [failure, setFailure] = useState("");
  const [rubricOpen, setRubricOpen] = useState(false);
  const [criteria, setCriteria] = useState<CriterionDraft[]>([]);
  const [rubricFailure, setRubricFailure] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    request<Assignment>(`/assignments/${assignmentId}`, { token: token() })
      .then((value) => value && setAssignment(value))
      .catch(() => setFailure("Unable to load assignment."));
  }, [assignmentId]);
  useEffect(() => { load(); }, [load]);

  const total = criteria.reduce((sum, criterion) => sum + (Number(criterion.maximum_score) || 0), 0);

  function openRubric() {
    const source = assignment?.criteria.length ? assignment.criteria : DEFAULT_TEMPLATE;
    setCriteria(source.map((criterion) => ({ title: criterion.title, maximum_score: String(criterion.maximum_score) })));
    setRubricFailure("");
    setRubricOpen(true);
  }
  const addCriterion = () => setCriteria([...criteria, { title: "", maximum_score: "0" }]);
  const removeCriterion = (index: number) => setCriteria(criteria.filter((_, i) => i !== index));
  const updateCriterion = (index: number, field: keyof CriterionDraft, value: string) =>
    setCriteria(criteria.map((criterion, i) => (i === index ? { ...criterion, [field]: value } : criterion)));
  const splitEvenly = () => {
    if (!criteria.length) return;
    const base = Math.floor(100 / criteria.length);
    const remainder = 100 - base * criteria.length;
    setCriteria(criteria.map((criterion, i) => ({ ...criterion, maximum_score: String(base + (i === 0 ? remainder : 0)) })));
  };
  const useDefaultTemplate = () => setCriteria(DEFAULT_TEMPLATE.map((criterion) => ({ title: criterion.title, maximum_score: String(criterion.maximum_score) })));

  async function saveRubric(event: FormEvent) {
    event.preventDefault();
    if (!assignmentId || total !== 100 || !criteria.length) return;
    setBusy(true);
    setRubricFailure("");
    try {
      const saved = await request<Assignment>(`/assignments/${assignmentId}/rubric`, {
        method: "PUT",
        token: token(),
        body: { criteria: criteria.map((criterion) => ({ title: criterion.title.trim(), maximum_score: Number(criterion.maximum_score) })) },
      });
      if (saved) setAssignment(saved);
      setRubricOpen(false);
    } catch (error) {
      setRubricFailure(error instanceof Error ? error.message : "Unable to save rubric.");
    } finally {
      setBusy(false);
    }
  }

  if (failure) return <Alert>{failure}</Alert>;
  if (!assignment) return <Spinner label="Loading assignment" />;
  return <section className="page-stack">
    <Link className="back-link" to={`/teacher/classes/${assignment.classroom_id}?tab=assignments`}>‹ Back</Link>
    <h1>{assignment.title}</h1>
    <p>{assignment.description}</p>
    <p>Hạn nộp: {formatDateTime(assignment.due_at)}</p>
    <Button onClick={openRubric}>Sửa rubric</Button>
    <Card><p className="muted">Submissions — see 04-submissions.</p></Card>
    {rubricOpen && <Dialog open onClose={() => setRubricOpen(false)} title="Sửa rubric">
      <form noValidate onSubmit={saveRubric}>
        {rubricFailure && <Alert>{rubricFailure}</Alert>}
        <p>Total: {total} / 100 <span className={total !== 100 ? "rubric-total-invalid" : ""}>Còn lại: {100 - total}</span></p>
        {criteria.map((criterion, index) => <div className="form-grid" key={index}>
          <Field id={`rubric-title-${index}`} label="Criterion" value={criterion.title} onChange={(event) => updateCriterion(index, "title", event.target.value)} />
          <Field id={`rubric-score-${index}`} label="Points" type="number" min={1} max={100} value={criterion.maximum_score} onChange={(event) => updateCriterion(index, "maximum_score", event.target.value)} />
          <Button type="button" className="button-secondary" onClick={() => removeCriterion(index)}>Xóa</Button>
        </div>)}
        <div className="form-actions">
          <Button type="button" className="button-secondary" onClick={addCriterion}>Add criterion</Button>
          <Button type="button" className="button-secondary" onClick={splitEvenly}>Chia đều</Button>
          <Button type="button" className="button-secondary" onClick={useDefaultTemplate}>Dùng mẫu mặc định</Button>
        </div>
        <div className="dialog-actions">
          <Button type="button" className="button-secondary" disabled={busy} onClick={() => setRubricOpen(false)}>Cancel</Button>
          <Button type="submit" disabled={busy || total !== 100 || !criteria.length}>{busy ? "Saving…" : "Save rubric"}</Button>
        </div>
      </form>
    </Dialog>}
  </section>;
}
