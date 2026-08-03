import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { AdminDashboardView } from "../../pages/dashboard/AdminDashboardView";
import { StudentDashboardView } from "../../pages/dashboard/StudentDashboardView";
import { TeacherDashboardView } from "../../pages/dashboard/TeacherDashboardView";
import type { AdminDashboard, StudentDashboard, TeacherDashboard } from "../../types";

const admin: AdminDashboard = {
  role: "ADMIN",
  accounts: { admins: 2, teachers: 3, students: 5 },
  classes: { running: 1, scheduled: 4, ended: 2, disabled: 6 },
  recent_audit: [
    {
      id: 812,
      action: "class.created",
      target_label: "Web Development K18A",
      actor: { id: 1, full_name: "Le Quoc Bao", role: "ADMIN" },
      created_at: "2026-08-03T10:15:00Z",
    },
  ],
};

describe("Admin dashboard view", () => {
  it("shows every account and class number", () => {
    render(<MemoryRouter><AdminDashboardView data={admin} /></MemoryRouter>);

    for (const value of ["2", "3", "5", "1", "4", "6"]) {
      expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    }
  });

  it("renders an audit row with its resolved target", () => {
    render(<MemoryRouter><AdminDashboardView data={admin} /></MemoryRouter>);

    expect(screen.getByText("Web Development K18A")).toBeTruthy();
    expect(screen.getByText("Le Quoc Bao")).toBeTruthy();
  });

  it("says the log is empty instead of showing a bare table", () => {
    render(<MemoryRouter><AdminDashboardView data={{ ...admin, recent_audit: [] }} /></MemoryRouter>);

    expect(screen.getByText("Chưa có hoạt động nào.")).toBeTruthy();
  });
});

const teacher: TeacherDashboard = {
  role: "TEACHER",
  cards: { my_classes: 4, running_classes: 2, open_assignments: 6, pending_grading: 11, students: 63 },
  pending: [{
    submission_id: 991, assignment_id: 42, assignment_title: "Lab 3",
    class_id: 7, class_name: "Web Development K18A",
    student: { id: 55, full_name: "Tran Minh Anh" },
    submitted_at: "2026-08-03T09:40:00Z",
  }],
  due_soon: [{
    assignment_id: 44, title: "Lab 4", class_id: 7, class_name: "Web Development K18A",
    due_at: "2026-08-05T17:00:00Z", submitted_count: 12, student_count: 30,
  }],
};

const student: StudentDashboard = {
  role: "STUDENT",
  cards: { my_classes: 2, not_submitted: 3, graded: 8, average_score: 82.5 },
  todo: [{ assignment_id: 44, title: "Lab 4", class_id: 7, class_name: "Web Development K18A", due_at: "2026-08-05T17:00:00Z" }],
  recent_grades: [{
    assignment_id: 42, title: "Lab 3", class_id: 7, class_name: "Web Development K18A",
    score: 85, maximum_score: 100, graded_at: "2026-08-02T15:10:00Z",
  }],
};

describe("Teacher dashboard view", () => {
  it("shows the grading backlog and who is waiting", () => {
    render(<MemoryRouter><TeacherDashboardView data={teacher} /></MemoryRouter>);

    expect(screen.getByText("11")).toBeTruthy();
    expect(screen.getByText("Tran Minh Anh")).toBeTruthy();
  });

  it("shows how much of a due-soon assignment is in", () => {
    render(<MemoryRouter><TeacherDashboardView data={teacher} /></MemoryRouter>);

    expect(screen.getByText("12/30")).toBeTruthy();
  });

  it("celebrates an empty backlog instead of showing a bare table", () => {
    render(<MemoryRouter><TeacherDashboardView data={{ ...teacher, pending: [] }} /></MemoryRouter>);

    expect(screen.getByText("Không còn bài nào chờ chấm.")).toBeTruthy();
  });
});

describe("Student dashboard view", () => {
  it("shows the average score", () => {
    render(<MemoryRouter><StudentDashboardView data={student} /></MemoryRouter>);

    expect(screen.getByText("82.5")).toBeTruthy();
  });

  it("shows an em dash when nothing is graded yet", () => {
    render(<MemoryRouter><StudentDashboardView data={{
      ...student,
      cards: { ...student.cards, graded: 0, average_score: null },
    }} /></MemoryRouter>);

    expect(screen.getByText("—")).toBeTruthy();
  });

  it("shows a grade out of its maximum", () => {
    render(<MemoryRouter><StudentDashboardView data={student} /></MemoryRouter>);

    expect(screen.getByText("85/100")).toBeTruthy();
  });

  it("says the to-do list is empty instead of showing a bare table", () => {
    render(<MemoryRouter><StudentDashboardView data={{ ...student, todo: [] }} /></MemoryRouter>);

    expect(screen.getByText("Không có bài nào cần nộp.")).toBeTruthy();
  });
});
