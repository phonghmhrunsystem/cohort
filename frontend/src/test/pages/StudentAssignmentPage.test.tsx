import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { StudentAssignmentPage } from "../../pages/student/StudentAssignmentPage";

describe("Student assignment page", () => {
  it("renders a stub pointing at 04-submissions", () => {
    render(
      <MemoryRouter initialEntries={["/student/assignments/5"]}>
        <Routes>
          <Route path="/student/assignments/:assignmentId" element={<StudentAssignmentPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Assignment detail — see 04-submissions.")).toBeTruthy();
  });
});
