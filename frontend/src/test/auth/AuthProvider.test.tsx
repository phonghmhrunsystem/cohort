import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "../../auth/AuthProvider";

function AuthState() {
  const { loading, user } = useAuth();
  return <p>{loading ? "Loading" : user?.email ?? "Signed out"}</p>;
}

describe("AuthProvider", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("loads me once with the session access token", async () => {
    sessionStorage.setItem("access_token", "session-token");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1, full_name: "Ada", email: "ada@example.test", role: "TEACHER", phone: null,
      date_of_birth: null, gender: null, hometown: null, address: null, is_active: true, must_change_password: false,
    }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthProvider><AuthState /></AuthProvider>);

    await screen.findByText("ada@example.test");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer session-token" }),
    }));
  });

  it("clears a rejected session once", async () => {
    sessionStorage.setItem("access_token", "stale-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    render(<AuthProvider><AuthState /></AuthProvider>);

    await screen.findByText("Signed out");
    expect(sessionStorage.getItem("access_token")).toBeNull();
  });
});
