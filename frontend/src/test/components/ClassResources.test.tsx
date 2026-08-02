import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClassResources } from "../../components/ClassResources";
import { ToastProvider } from "../../components/Toast";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});

const link = (overrides = {}) => ({
  id: 1, title: "Slide deck", description: "Week 1 slides", kind: "link" as const,
  url: "https://example.test/slides", original_filename: "", content_type: "", size: null, ...overrides,
});
const file = (overrides = {}) => ({
  id: 2, title: "Giáo trình", description: "", kind: "file" as const, url: "",
  original_filename: "giao-trinh.pdf", content_type: "application/pdf", size: 2560, ...overrides,
});

function show(rows: unknown[], manage = false) {
  sessionStorage.setItem("access_token", "token");
  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    Promise.resolve(!init?.method || init.method === "GET" ? json(rows) : json({}, init.method === "DELETE" ? 204 : 200)));
  vi.stubGlobal("fetch", fetchMock);
  render(<ToastProvider><ClassResources classId={9} manage={manage} /></ToastProvider>);
  return fetchMock;
}

const posts = (mock: ReturnType<typeof show>) => mock.mock.calls.filter((call) => call[1]?.method === "POST");

describe("Class resources", () => {
  afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); });

  it("lists a link as an external link with its description", async () => {
    show([link(), link({ id: 3, title: "Reference repo", description: "", url: "https://example.test/repo" })]);
    const anchor = await screen.findByRole("link", { name: /Slide deck/ });
    expect(anchor.getAttribute("href")).toBe("https://example.test/slides");
    expect(anchor.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText("Week 1 slides")).toBeTruthy();
  });

  it("lists a file as a download button with its filename and size", async () => {
    show([file()]);
    expect(await screen.findByRole("button", { name: /Giáo trình/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Giáo trình/ })).toBeNull();
    expect(screen.getByText(/giao-trinh\.pdf · 2\.5 KB/)).toBeTruthy();
  });

  it("shows an empty state when the class has no resources", async () => {
    show([]);
    expect(await screen.findByText("Chưa có tài liệu nào.")).toBeTruthy();
  });

  it("surfaces a load failure instead of an empty list", async () => {
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "boom" }, 500)));
    render(<ToastProvider><ClassResources classId={9} /></ToastProvider>);
    expect(await screen.findByText("Không tải được tài liệu.")).toBeTruthy();
  });

  it("hides every management control from a student", async () => {
    show([link()]);
    await screen.findByRole("link", { name: /Slide deck/ });
    expect(screen.queryByRole("button", { name: "Sửa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Xoá" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tạo tài liệu" })).toBeNull();
  });

  it("posts a link as JSON and a file as multipart", async () => {
    const fetchMock = show([], true);
    await screen.findByText("Chưa có tài liệu nào.");

    await userEvent.type(screen.getByLabelText("Title"), "Slide deck");
    await userEvent.type(screen.getByLabelText("URL"), "https://example.test/s");
    await userEvent.click(screen.getByRole("button", { name: "Tạo tài liệu" }));
    await waitFor(() => expect(posts(fetchMock).length).toBe(1));
    expect(JSON.parse(posts(fetchMock)[0][1]!.body as string)).toMatchObject({ title: "Slide deck", url: "https://example.test/s" });

    await userEvent.click(screen.getByRole("radio", { name: "Tệp tin" }));
    await userEvent.type(screen.getByLabelText("Title"), "Notes");
    await userEvent.upload(document.querySelector<HTMLInputElement>("#resource-file")!, new File(["x"], "notes.pdf", { type: "application/pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Tạo tài liệu" }));
    await waitFor(() => expect(posts(fetchMock).length).toBe(2));
    expect(posts(fetchMock)[1][1]!.body).toBeInstanceOf(FormData);
  });

  it("edits a resource in place with a PATCH", async () => {
    const fetchMock = show([link()], true);
    await userEvent.click(await screen.findByRole("button", { name: "Sửa" }));
    const title = document.querySelector<HTMLInputElement>("#resource-1-title")!;
    await userEvent.clear(title);
    await userEvent.type(title, "Renamed");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => call[1]?.method === "PATCH")).toBe(true));
    const patched = fetchMock.mock.calls.find((call) => call[1]?.method === "PATCH")!;
    expect(patched[0]).toBe("/api/classes/9/resources/1");
    expect(JSON.parse(patched[1]!.body as string).title).toBe("Renamed");
  });

  it("asks for confirmation before deleting", async () => {
    const fetchMock = show([link()], true);
    await userEvent.click(await screen.findByRole("button", { name: "Xoá" }));
    expect(fetchMock.mock.calls.every((call) => call[1]?.method !== "DELETE")).toBe(true);
    const dialog = document.querySelector("dialog")!;
    await userEvent.click(within(dialog as HTMLElement).getByRole("button", { name: "Xoá" }));
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => call[1]?.method === "DELETE")).toBe(true));
  });
});
