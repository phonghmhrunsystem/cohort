import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { DashboardPage } from "../../pages/DashboardPage";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json" },
});

const adminPayload = {
  role: "ADMIN",
  accounts: { admins: 2, teachers: 3, students: 5 },
  classes: { running: 1, scheduled: 0, ended: 2, disabled: 1 },
  recent_audit: [],
};

const studentPayload = {
  role: "STUDENT",
  cards: { my_classes: 1, not_submitted: 2, graded: 0, average_score: null },
  todo: [],
  recent_grades: [],
};

function openPage(fetchMock: ReturnType<typeof vi.fn>) {
  sessionStorage.setItem("access_token", "token");
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><DashboardPage /></MemoryRouter>);
}

describe("Dashboard page", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders the admin view for an admin payload", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(adminPayload)));

    await waitFor(() => expect(screen.getByText("Tài khoản")).toBeTruthy());
  });

  it("renders the student view for a student payload", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json(studentPayload)));

    await waitFor(() => expect(screen.getByText("Bài chưa nộp")).toBeTruthy());
  });

  it("shows a failure message instead of an empty screen", async () => {
    openPage(vi.fn().mockResolvedValueOnce(json({ detail: "Server error." }, 500)));

    await waitFor(() => expect(screen.getByText("Server error.")).toBeTruthy());
  });

  it("asks for the dashboard exactly once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(adminPayload));
    openPage(fetchMock);

    await waitFor(() => expect(screen.getByText("Tài khoản")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/dashboard");
  });
});
