import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClassResources } from "../../components/ClassResources";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});

describe("Class resources", () => {
  afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); });

  it("lists each resource as an external link with its description", async () => {
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([
      { id: 1, title: "Slide deck", description: "Week 1 slides", url: "https://example.test/slides" },
      { id: 2, title: "Reference repo", description: "", url: "https://example.test/repo" },
    ])));
    render(<ClassResources classId={9} />);
    const link = await screen.findByRole("link", { name: /Slide deck/ });
    expect(link.getAttribute("href")).toBe("https://example.test/slides");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText("Week 1 slides")).toBeTruthy();
  });

  it("shows an empty state when the class has no resources", async () => {
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    render(<ClassResources classId={9} />);
    expect(await screen.findByText("Chưa có tài liệu nào.")).toBeTruthy();
  });

  it("surfaces a load failure instead of an empty list", async () => {
    sessionStorage.setItem("access_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "boom" }, 500)));
    render(<ClassResources classId={9} />);
    expect(await screen.findByText("Không tải được tài liệu.")).toBeTruthy();
  });
});
