import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { AdminDashboardView } from "../../pages/dashboard/AdminDashboardView";
import type { AdminDashboard } from "../../types";

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
