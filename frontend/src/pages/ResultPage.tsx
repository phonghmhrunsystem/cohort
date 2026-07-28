import { useEffect, useState } from "react";

import { Assignment, getAssignment } from "../assignments";
import { Grade, getMyResult } from "../grading";

export function ResultPage({ assignmentId }: { assignmentId: number }) {
  const [assignment, setAssignment] = useState<Assignment>();
  const [grade, setGrade] = useState<Grade | null>();
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [nextAssignment, result] = await Promise.all([
          getAssignment(assignmentId),
          getMyResult(assignmentId).catch((response) => {
            if ((response as { status?: number }).status === 404) return null;
            throw response;
          }),
        ]);
        setAssignment(nextAssignment); setGrade(result);
      } catch (response) { setError((response as { detail?: string }).detail ?? "Unable to load this result."); }
    })();
  }, [assignmentId]);

  if (error) return <div className="alert alert-danger" role="alert">{error}</div>;
  if (!assignment || grade === undefined) return <div className="alert alert-secondary">Loading…</div>;

  return <>
    <a href={`/student/assignments/${assignmentId}`}>Back to assignment</a>
    <h1 className="h2 mt-2">My result</h1>
    {grade === null ? <div className="alert alert-secondary">Not graded yet.</div> : <section className="card border-0 shadow-sm"><div className="card-body">
      <h2 className="h4">Total score: {grade.total_score}{assignment.criteria.length ? "" : " / 100"}</h2>
      <p>{grade.feedback}</p>
      {assignment.criteria.length > 0 && <ul className="list-group list-group-flush">{assignment.criteria.map((criterion) => {
        const score = grade.scores.find((item) => item.criterion_id === criterion.id);
        return <li className="list-group-item px-0" key={criterion.id}>{criterion.title}: {score ? score.score : 0} / {criterion.maximum_score}</li>;
      })}</ul>}
    </div></section>}
  </>;
}
