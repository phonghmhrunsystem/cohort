import { Link } from "react-router-dom";

import { Card } from "../../components/Card";

export function StudentAssignmentPage() {
  return <section className="page-stack">
    <Link className="back-link" to="/student/classes">‹ Back</Link>
    <Card><p className="muted">Assignment detail — see 04-submissions.</p></Card>
  </section>;
}
