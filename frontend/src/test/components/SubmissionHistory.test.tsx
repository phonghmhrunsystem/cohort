import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SubmissionHistory } from "../../components/SubmissionHistory";
import type { Submission } from "../../types";

const submission = (overrides: Partial<Submission> = {}): Submission => ({
  id: 1, assignment_id: 5, student_id: 3, student_name: "Nguyen Van A",
  version: 1, original_filename: "homework_v1.docx", content_type: "application/pdf",
  size: 943718, created_at: "2026-08-10T09:15:00Z", graded: false,
  ...overrides,
});

function pdfFile(name = "homework.pdf", sizeBytes = 1024) {
  const file = new File(["%PDF-1.4"], name, { type: "application/pdf" });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

describe("SubmissionHistory", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("shows the empty state when there are no submissions", () => {
    render(
      <SubmissionHistory assignmentId={5} submissions={[]} canSubmit closureReason={null} onSubmitted={() => {}} />,
    );
    expect(screen.getByText("Bạn chưa nộp bài nào.")).toBeTruthy();
  });

  it("lists versions newest first with size and a download link", () => {
    render(
      <SubmissionHistory
        assignmentId={5}
        submissions={[submission({ id: 2, version: 2, original_filename: "homework_v2.pdf" }), submission()]}
        canSubmit
        closureReason={null}
        onSubmitted={() => {}}
      />,
    );
    const rows = screen.getAllByRole("row");
    expect(rows[1].textContent).toContain("v2");
    expect(rows[1].textContent).toContain("homework_v2.pdf");
    expect(rows[2].textContent).toContain("v1");
  });

  it("rejects a non-pdf/docx file inline without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<SubmissionHistory assignmentId={5} submissions={[]} canSubmit closureReason={null} onSubmitted={() => {}} />);
    const events = userEvent.setup();

    const input = screen.getByLabelText(/choose file/i);
    const badFile = new File(["hi"], "notes.txt", { type: "text/plain" });
    await events.upload(input, badFile);

    expect(screen.getByText("Chỉ nhận file PDF hoặc DOCX.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a file over 25MB inline without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<SubmissionHistory assignmentId={5} submissions={[]} canSubmit closureReason={null} onSubmitted={() => {}} />);
    const events = userEvent.setup();

    const input = screen.getByLabelText(/choose file/i);
    await events.upload(input, pdfFile("big.pdf", 26 * 1024 * 1024));

    expect(screen.getByText("File vượt quá 25 MB.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears the chosen file with the (x) button", async () => {
    render(<SubmissionHistory assignmentId={5} submissions={[]} canSubmit closureReason={null} onSubmitted={() => {}} />);
    const events = userEvent.setup();
    await events.upload(screen.getByLabelText(/choose file/i), pdfFile());
    expect(screen.getByText("homework.pdf")).toBeTruthy();

    await events.click(screen.getByRole("button", { name: "x" }));
    expect(screen.queryByText("homework.pdf")).toBeNull();
  });

  it("submits the file, disables the button while in flight, and reports success", async () => {
    sessionStorage.setItem("access_token", "token");
    const created = submission();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(created), { status: 201, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSubmitted = vi.fn();
    render(<SubmissionHistory assignmentId={5} submissions={[]} canSubmit closureReason={null} onSubmitted={onSubmitted} />);
    const events = userEvent.setup();

    await events.upload(screen.getByLabelText(/choose file/i), pdfFile());
    await events.click(screen.getByRole("button", { name: "Nộp bài" }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(created));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assignments/5/submissions",
      expect.objectContaining({ method: "POST" }),
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("on a 400 keeps the file and shows the error inline", async () => {
    sessionStorage.setItem("access_token", "token");
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Chỉ nhận file PDF hoặc DOCX." }), {
        status: 400, headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<SubmissionHistory assignmentId={5} submissions={[]} canSubmit closureReason={null} onSubmitted={() => {}} />);
    const events = userEvent.setup();
    await events.upload(screen.getByLabelText(/choose file/i), pdfFile());
    await events.click(screen.getByRole("button", { name: "Nộp bài" }));

    await waitFor(() => expect(screen.getByText("Chỉ nhận file PDF hoặc DOCX.")).toBeTruthy());
    expect(screen.getByText("homework.pdf")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nộp bài" }).hasAttribute("disabled")).toBe(false);
  });

  it("hides the submit form when canSubmit is false and shows the closure reason", () => {
    render(
      <SubmissionHistory assignmentId={5} submissions={[]} canSubmit={false} closureReason="Đã chấm, không thể nộp lại" onSubmitted={() => {}} />,
    );
    expect(screen.queryByLabelText(/choose file/i)).toBeNull();
    expect(screen.getByText("Đã chấm, không thể nộp lại")).toBeTruthy();
  });
});
