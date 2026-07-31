import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiFailure } from "../../lib/errors";
import { assignmentSubmissionsPath, request, classAssignmentsPath, submissionDownloadUrl } from "../../lib/api";

describe("request", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends its bearer token and returns undefined for a 204 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { headers: { "Content-Type": "application/json" }, status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(request<void>("/auth/logout", { method: "POST", token: "access-token" })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer access-token" }),
        method: "POST",
      }),
    );
  });

  it("throws typed field errors for a 422 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ email: ["A user with this email already exists."] }), {
          headers: { "Content-Type": "application/json" },
          status: 422,
        }),
      ),
    );

    await expect(request("/users", { method: "POST", body: { email: "ada@example.test" } })).rejects.toMatchObject({
      fields: { email: ["A user with this email already exists."] },
      status: 422,
    } satisfies Partial<ApiFailure>);
  });

  it("keeps a 422 detail response out of field errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "The class is no longer active." }), {
          headers: { "Content-Type": "application/json" },
          status: 422,
        }),
      ),
    );

    await expect(request("/classes/1/enrollments", { method: "POST" })).rejects.toMatchObject({
      fields: undefined,
      message: "The class is no longer active.",
      status: 422,
    } satisfies Partial<ApiFailure>);
  });
});

describe("classAssignmentsPath", () => {
  it("builds the assignments path for a class", () => {
    expect(classAssignmentsPath(9)).toBe("/classes/9/assignments");
  });
});

describe("request with FormData", () => {
  it("sends FormData as-is without a JSON Content-Type header", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const form = new FormData();
    form.append("file", new Blob(["x"]), "a.pdf");
    await request("/assignments/1/submissions", { method: "POST", body: form, token: "t" });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(form);
    expect(init.headers.Authorization).toBe("Bearer t");
    expect(init.headers["Content-Type"]).toBeUndefined();

    vi.unstubAllGlobals();
  });
});

describe("path helpers", () => {
  it("builds the assignment submissions path", () => {
    expect(assignmentSubmissionsPath(5)).toBe("/assignments/5/submissions");
  });

  it("builds the submission download url", () => {
    expect(submissionDownloadUrl(9)).toBe("/api/submissions/9/download");
  });
});
