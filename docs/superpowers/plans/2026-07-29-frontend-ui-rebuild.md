# Frontend UI Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin `frontend/` from Bootstrap 5 to Tailwind CSS, replace full-reload routing with React Router SPA navigation, add a self-service email-based password-reset flow (frontend + new Django backend endpoints), add a Dashboard home and 404 page, replace native HTML validation with inline JS validation everywhere, and rewrite the test suite with `@testing-library/react`. Existing functional behavior (data shown, actions available, error handling) is preserved except where the spec explicitly calls out a change.

**Architecture:** SPA shell (`<BrowserRouter>` + flat route table in `main.tsx`) wraps a new `AuthContext` that fetches the current user once; each protected route is gated by a `<RequireRole>` element replacing the current regex `canAccess()` check. Pages are progressively rewritten onto a small shared Tailwind UI primitive set (`src/components/ui/`), each page keeping its existing data-fetching logic untouched — only markup/styling and param-passing mechanics change. A new Django `password-reset` flow (token-based, emailed) replaces the admin-approval-queue model on the backend, built against the contract the frontend already assumes.

**Tech Stack:** React 19, Vite 7, TypeScript 5.9, `react-router-dom` (new), Tailwind CSS + PostCSS + Autoprefixer (new), `@testing-library/react` + `@testing-library/jest-dom` + `@testing-library/user-event` (new, replaces hand-rolled `vi.mock("react", ...)` harness), Vitest 4 (existing), Django 5 / DRF (existing backend), Django's built-in test runner (existing).

## Global Constraints

- Tailwind CSS replaces Bootstrap 5 (CDN `<link>` in `frontend/index.html` + `frontend/src/styles.css` removed once migration is complete — not before, since pages migrate incrementally).
- React Router (`react-router-dom`) replaces the current full-reload routing in `frontend/src/main.tsx`. `roleHome()` returns `/dashboard` for every role.
- Every form uses `<form noValidate>` and a page-local `validate(draft) => Record<string, string>` run on submit; native blocking-tooltip attributes (`required`, `pattern`, blocking `minLength`) are removed. `type="email"`, `type="date"`, and non-blocking `maxLength` are kept.
- On submit failure (client validation or `ApiFailure`), field values are never cleared — only error state updates. Any currently-uncontrolled form (reads `FormData` directly) moves to controlled state.
- `/admin/password-reset-requests` route, nav link, page, and its two backend endpoints are removed entirely.
- New UI primitives live in `frontend/src/components/ui/` and are the only styling surface pages use going forward — no component library dependency (no shadcn/Radix).
- `AppDialog`'s `<dialog>` + focus-restore behavior (see Task 5 below) is preserved; only its Tailwind classes change.
- Each rewritten page gets a `@testing-library/react` test using `render()` + a shared helper wrapping the tree in `MemoryRouter` + a mock `AuthContext.Provider`; tests query by role/label/text.
- Working tree already has uncommitted changes (icons, `AppShell` nav/drawer wiring, `styles.css` design tokens, minor page tweaks) from a prior session — Task 1 commits this as the starting baseline rather than redoing it.

---

## Task 1: Commit the existing uncommitted baseline

The working tree already has 13 modified files + 1 untracked file (`frontend/src/components/icons.tsx`) from a prior session: custom SVG icon set, `AppShell` nav/drawer wiring to use them, a `styles.css` design-token expansion, and minor page tweaks (`AdminClassPage.tsx`, `AdminClassesPage.tsx`, `AdminUsersPage.tsx`, `ProfilePage.tsx`, `TeacherClassPage.tsx`, plus 3 test files, plus `frontend/index.html` font/preconnect additions). None of this touches Tailwind, React Router, or the password-reset flow. Commit it as-is so subsequent tasks diff cleanly against a known baseline.

**Files:**
- No new files. Stages and commits all 14 currently modified/untracked files listed in git status.

- [ ] **Step 1: Review the diff**

```bash
git status
git diff --stat
```

Confirm the file list matches: `frontend/index.html`, `frontend/src/AppShell.tsx`, `frontend/src/components/AppDialog.tsx`, `frontend/src/components/BackButton.tsx`, `frontend/src/components/icons.tsx` (untracked), `frontend/src/pages/AdminClassPage.tsx`, `frontend/src/pages/AdminClassesPage.tsx`, `frontend/src/pages/AdminUsersPage.test.tsx`, `frontend/src/pages/AdminUsersPage.tsx`, `frontend/src/pages/ProfilePage.test.tsx`, `frontend/src/pages/ProfilePage.tsx`, `frontend/src/pages/TeacherClassPage.links.test.tsx`, `frontend/src/pages/TeacherClassPage.tsx`, `frontend/src/styles.css`.

- [ ] **Step 2: Run the existing test suite to confirm the baseline is green**

```bash
cd frontend && npm test
```

Expected: all existing tests PASS (this is pre-rebuild code, still Bootstrap/hand-rolled-mock based).

- [ ] **Step 3: Stage and commit**

```bash
git add frontend/index.html frontend/src/AppShell.tsx frontend/src/components/AppDialog.tsx frontend/src/components/BackButton.tsx frontend/src/components/icons.tsx frontend/src/pages/AdminClassPage.tsx frontend/src/pages/AdminClassesPage.tsx frontend/src/pages/AdminUsersPage.test.tsx frontend/src/pages/AdminUsersPage.tsx frontend/src/pages/ProfilePage.test.tsx frontend/src/pages/ProfilePage.tsx frontend/src/pages/TeacherClassPage.links.test.tsx frontend/src/pages/TeacherClassPage.tsx frontend/src/styles.css
git commit -m "chore: commit in-progress icon/design-token baseline"
```

---

## Task 2: Install tooling and configure Tailwind

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/tailwind.config.js`, `frontend/postcss.config.js`
- Create: `frontend/src/tailwind.css`
- Modify: `frontend/index.html` (swap Bootstrap CDN `<link>` for the compiled Tailwind stylesheet import; keep the Fira Sans font links)
- Modify: `frontend/src/main.tsx` (import `./tailwind.css` instead of `./styles.css` — `styles.css` itself is not deleted yet, still referenced by unmigrated pages until Task 28)

**Interfaces:**
- Produces: Tailwind utility classes available in every `.tsx` file under `frontend/src/`; custom palette tokens `brand-50`..`brand-900` and font family `sans: ["Fira Sans", ...]` usable as `font-sans`, `text-brand-600`, etc.

- [ ] **Step 1: Install dependencies**

```bash
cd frontend
npm install -D tailwindcss@^3 postcss@^8 autoprefixer@^10 react-router-dom@^7 @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event@^14
npm install react-router-dom@^7
```

(`react-router-dom` is a runtime dependency; the rest are dev.)

- [ ] **Step 2: Write Tailwind config**

`frontend/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Fira Sans", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe6fe",
          200: "#bdd0fe",
          300: "#8fb0fc",
          400: "#5b87f8",
          500: "#3763f0",
          600: "#2547d9",
          700: "#2038b0",
          800: "#1f338c",
          900: "#1e2f6f",
        },
      },
    },
  },
  plugins: [],
};
```

`frontend/postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: Write the Tailwind entry stylesheet**

`frontend/src/tailwind.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Wire it into `index.html` and `main.tsx`**

In `frontend/index.html`, remove the Bootstrap CDN `<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/...">` line. Keep the `preconnect` and Fira Sans `<link>` tags as-is.

In `frontend/src/main.tsx`, add `import "./tailwind.css";` near the top (alongside the existing `import "./styles.css";`, which stays until Task 28 since unmigrated pages still depend on Bootstrap-override rules in it).

- [ ] **Step 5: Verify build**

```bash
cd frontend && npm run build
```

Expected: build succeeds, no Tailwind/PostCSS errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/tailwind.config.js frontend/postcss.config.js frontend/src/tailwind.css frontend/index.html frontend/src/main.tsx
git commit -m "chore: install Tailwind, React Router, testing-library"
```

---

## Task 3: UI primitives

**Files:**
- Create: `frontend/src/components/ui/Button.tsx`
- Create: `frontend/src/components/ui/Card.tsx`
- Create: `frontend/src/components/ui/Badge.tsx`
- Create: `frontend/src/components/ui/Field.tsx`
- Create: `frontend/src/components/ui/Table.tsx`
- Create: `frontend/src/components/ui/EmptyState.tsx`
- Create: `frontend/src/components/ui/Spinner.tsx`
- Create: `frontend/src/components/ui/Alert.tsx`
- Test: `frontend/src/components/ui/ui.test.tsx`

**Interfaces:**
- Produces (used by every subsequent page task):
  - `Button({ variant = "primary" | "secondary" | "danger" | "ghost", size = "md" | "sm", ...ButtonHTMLAttributes<HTMLButtonElement> })`
  - `Card({ children, className? }: { children: ReactNode; className?: string })`
  - `Badge({ tone = "neutral" | "success" | "warning" | "danger", children }: { tone?: Tone; children: ReactNode })`
  - `Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: ReactNode })`
  - `Table({ children, className? })`, plain wrapper applying `<table>` Tailwind classes — headers/rows still authored by callers with `<thead>`/`<tbody>`.
  - `EmptyState({ title, description }: { title: string; description?: string })`
  - `Spinner({ label = "Loading" }: { label?: string })`
  - `Alert({ tone = "error" | "success" | "info", children }: { tone?: Tone; children: ReactNode })`

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/ui/ui.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./Button";
import { Field } from "./Field";
import { Alert } from "./Alert";
import { Badge } from "./Badge";

describe("UI primitives", () => {
  test("Button renders children and applies variant class", () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toMatch(/bg-red/);
  });

  test("Field renders label bound to input via htmlFor/id and shows error", () => {
    render(
      <Field label="Email" htmlFor="email" error="Required">
        <input id="email" />
      </Field>
    );
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByText("Required")).toBeInTheDocument();
  });

  test("Field omits error text when no error given", () => {
    render(
      <Field label="Email" htmlFor="email2">
        <input id="email2" />
      </Field>
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("Alert renders content with tone-based styling", () => {
    render(<Alert tone="error">Something failed</Alert>);
    expect(screen.getByRole("alert")).toHaveTextContent("Something failed");
  });

  test("Badge renders children", () => {
    render(<Badge tone="success">Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npx vitest run src/components/ui/ui.test.tsx
```

Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Implement primitives**

`frontend/src/components/ui/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "md" | "sm";

const variantClasses: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600",
  secondary: "bg-white text-slate-900 border border-slate-300 hover:bg-slate-50",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100",
};

const sizeClasses: Record<Size, string> = {
  md: "px-4 py-2 text-sm",
  sm: "px-3 py-1.5 text-xs",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    />
  );
}
```

`frontend/src/components/ui/Card.tsx`:

```tsx
import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}
```

`frontend/src/components/ui/Badge.tsx`:

```tsx
import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}
```

`frontend/src/components/ui/Field.tsx`:

```tsx
import type { ReactNode } from "react";

export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

`frontend/src/components/ui/Table.tsx`:

```tsx
import type { ReactNode } from "react";

export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={`min-w-full divide-y divide-slate-200 text-sm ${className}`}>{children}</table>
    </div>
  );
}
```

`frontend/src/components/ui/EmptyState.tsx`:

```tsx
export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 p-8 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {description ? <p className="text-sm text-slate-500">{description}</p> : null}
    </div>
  );
}
```

`frontend/src/components/ui/Spinner.tsx`:

```tsx
export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
```

`frontend/src/components/ui/Alert.tsx`:

```tsx
import type { ReactNode } from "react";

type Tone = "error" | "success" | "info";

const toneClasses: Record<Tone, string> = {
  error: "bg-red-50 text-red-800 border-red-200",
  success: "bg-green-50 text-green-800 border-green-200",
  info: "bg-blue-50 text-blue-800 border-blue-200",
};

export function Alert({ tone = "error", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role="alert" className={`rounded-md border px-4 py-3 text-sm ${toneClasses[tone]}`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd frontend && npx vitest run src/components/ui/ui.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui
git commit -m "feat: add shared Tailwind UI primitives"
```

---

## Task 4: Extend icons for Dashboard and 404

`frontend/src/components/icons.tsx` already exists (committed in Task 1) with `MenuIcon, CloseIcon, ChevronLeftIcon, UsersIcon, KeyIcon, BookIcon, ClipboardIcon, UserIcon, BellIcon, LogoutIcon`. Add the two the spec calls for: `HomeIcon` (dashboard nav) and a 404-page icon.

**Files:**
- Modify: `frontend/src/components/icons.tsx`

**Interfaces:**
- Produces: `HomeIcon({ className }: { className?: string })`, `CompassIcon({ className }: { className?: string })` (used on the 404 page).

- [ ] **Step 1: Read the current file to match its exact `base` SVG attrs pattern**

```bash
cat frontend/src/components/icons.tsx
```

- [ ] **Step 2: Add the two new icon components following the same pattern as the existing ones (20×20 viewBox, `stroke="currentColor"`, `aria-hidden="true"`)**

```tsx
export function HomeIcon({ className }: { className?: string }) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1V9.5Z" />
    </svg>
  );
}

export function CompassIcon({ className }: { className?: string }) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="7" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m12.5 7.5-1.8 4.2-4.2 1.8 1.8-4.2 4.2-1.8Z" />
    </svg>
  );
}
```

(Match the exact prop-spread name used for the shared attrs object — read Step 1's output and use whatever it's actually called, e.g. `base`, before pasting.)

- [ ] **Step 3: Verify it compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/icons.tsx
git commit -m "feat: add HomeIcon and CompassIcon"
```

---

## Task 5: AuthContext

**Files:**
- Create: `frontend/src/auth-context.tsx`
- Test: `frontend/src/auth-context.test.tsx`

**Interfaces:**
- Consumes: `getCurrentUser()` from `frontend/src/auth.tsx` (returns `Promise<User>`, rejects with `ApiFailure` on 401/error).
- Produces:
  ```ts
  export function AuthProvider({ children }: { children: ReactNode }): JSX.Element
  export function useAuth(): { user: User | null; loading: boolean; refresh: () => Promise<void> }
  ```
  `useAuth()` throws if called outside `AuthProvider`. `refresh()` re-fetches `getCurrentUser()` and updates `user` (used after login/change-password/profile-update).

- [ ] **Step 1: Write the failing test**

`frontend/src/auth-context.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./auth-context";

vi.mock("./auth.tsx", () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from "./auth.tsx";

function Probe() {
  const { user, loading } = useAuth();
  if (loading) return <span>loading</span>;
  return <span>{user ? user.email : "no-user"}</span>;
}

describe("AuthContext", () => {
  beforeEach(() => vi.mocked(getCurrentUser).mockReset());

  test("exposes loading then the fetched user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 1, email: "a@b.com", role: "ADMIN", full_name: null, phone: null,
      date_of_birth: null, gender: null, address: null, is_active: true,
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(screen.getByText("loading")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("a@b.com")).toBeInTheDocument());
  });

  test("exposes null user when getCurrentUser rejects (unauthenticated)", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue({ status: 401, detail: "unauthorized" });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("no-user")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npx vitest run src/auth-context.test.tsx
```

Expected: FAIL — `./auth-context` doesn't exist.

- [ ] **Step 3: Implement**

`frontend/src/auth-context.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getCurrentUser, type User } from "./auth.tsx";

type AuthState = { user: User | null; loading: boolean; refresh: () => Promise<void> };

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const current = await getCurrentUser();
      setUser(current);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <AuthContext.Provider value={{ user, loading, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd frontend && npx vitest run src/auth-context.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/auth-context.tsx frontend/src/auth-context.test.tsx
git commit -m "feat: add AuthContext"
```

---

## Task 6: RequireRole guard + test helper

**Files:**
- Create: `frontend/src/require-role.tsx`
- Create: `frontend/src/test-utils.tsx` (shared render helper used by every page test from here on)
- Test: `frontend/src/require-role.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` from Task 5, `Role` type from `frontend/src/session.ts`.
- Produces:
  ```ts
  export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }): JSX.Element
  ```
  Renders `<Spinner />` while `loading`. If `!user`, renders `<Navigate to="/login" replace />`. If `user` and `!roles.includes(user.role)`, renders `<Navigate to="/dashboard" replace />`. Otherwise renders `children`.

  `frontend/src/test-utils.tsx` produces:
  ```ts
  export function renderWithProviders(
    ui: ReactElement,
    opts?: { user?: User | null; route?: string }
  ): ReturnType<typeof render>
  ```
  Wraps `ui` in `<MemoryRouter initialEntries={[opts?.route ?? "/"]}>` and a mock `AuthContext.Provider` with `value={{ user: opts?.user ?? null, loading: false, refresh: vi.fn() }}`. Every subsequent page test task uses this.

- [ ] **Step 1: Write the failing test**

`frontend/src/require-role.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { screen } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import { RequireRole } from "./require-role";
import { renderWithProviders } from "./test-utils";

function Guarded() {
  return (
    <Routes>
      <Route
        path="/admin/users"
        element={
          <RequireRole roles={["ADMIN"]}>
            <span>admin content</span>
          </RequireRole>
        }
      />
      <Route path="/login" element={<span>login page</span>} />
      <Route path="/dashboard" element={<span>dashboard page</span>} />
    </Routes>
  );
}

describe("RequireRole", () => {
  test("redirects to /login when unauthenticated", () => {
    renderWithProviders(<Guarded />, { user: null, route: "/admin/users" });
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  test("redirects to /dashboard when role not allowed", () => {
    renderWithProviders(<Guarded />, {
      user: { id: 1, email: "s@x.com", role: "STUDENT", full_name: null, phone: null, date_of_birth: null, gender: null, address: null, is_active: true },
      route: "/admin/users",
    });
    expect(screen.getByText("dashboard page")).toBeInTheDocument();
  });

  test("renders children when role allowed", () => {
    renderWithProviders(<Guarded />, {
      user: { id: 1, email: "a@x.com", role: "ADMIN", full_name: null, phone: null, date_of_birth: null, gender: null, address: null, is_active: true },
      route: "/admin/users",
    });
    expect(screen.getByText("admin content")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npx vitest run src/require-role.test.tsx
```

Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement `test-utils.tsx` first (the guard test depends on it)**

`frontend/src/test-utils.tsx`:

```tsx
import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { AuthContext } from "./auth-context-internal";
import type { User } from "./auth.tsx";

export function renderWithProviders(ui: ReactElement, opts?: { user?: User | null; route?: string }) {
  return render(
    <MemoryRouter initialEntries={[opts?.route ?? "/"]}>
      <AuthContext.Provider value={{ user: opts?.user ?? null, loading: false, refresh: vi.fn() }}>
        {ui}
      </AuthContext.Provider>
    </MemoryRouter>
  );
}
```

This needs the `AuthContext` object itself exported, not just `useAuth`/`AuthProvider`. Go back and split `frontend/src/auth-context.tsx`'s context creation into `frontend/src/auth-context-internal.tsx`:

```tsx
import { createContext } from "react";
import type { User } from "./auth.tsx";

export type AuthState = { user: User | null; loading: boolean; refresh: () => Promise<void> };

export const AuthContext = createContext<AuthState | null>(null);
```

Then update `frontend/src/auth-context.tsx` to import `AuthContext` from `./auth-context-internal` instead of calling `createContext` itself, keeping `AuthProvider` and `useAuth` exports unchanged.

- [ ] **Step 4: Implement `require-role.tsx`**

`frontend/src/require-role.tsx`:

```tsx
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./auth-context.tsx";
import type { Role } from "./session.ts";
import { Spinner } from "./components/ui/Spinner";

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Đang kiểm tra phiên đăng nhập" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 5: Run to verify it passes**

```bash
cd frontend && npx vitest run src/require-role.test.tsx src/auth-context.test.tsx
```

Expected: PASS (5 tests total).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/require-role.tsx frontend/src/require-role.test.tsx frontend/src/test-utils.tsx frontend/src/auth-context-internal.tsx frontend/src/auth-context.tsx
git commit -m "feat: add RequireRole guard and shared test render helper"
```

---

## Task 7: `main.tsx` route table

**Files:**
- Modify: `frontend/src/main.tsx` (replace entirely — full-reload `pageFor()`/`render()` logic removed)

**Interfaces:**
- Consumes: `AuthProvider` (Task 5), `RequireRole` (Task 6), every page component (existing + new ones from later tasks — imported here even before they're rewritten, since rewriting a page's internals doesn't change its export).
- Produces: the app's route tree, matching the spec's route list exactly. Route params previously parsed by hand (`assignmentId`, `submissionId`, `role`, `classId`) are now read by each page via `useParams()` — **this task only wires the route table**; each page's internal `useParams()` read is done in that page's own task (Tasks 12–27), since it requires editing the page file itself. Until then, pass params as before via a thin wrapper so routing works end-to-end immediately.

- [ ] **Step 1: Read current `main.tsx` in full to inventory every route/page import**

```bash
cat frontend/src/main.tsx
```

- [ ] **Step 2: Replace `frontend/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./tailwind.css";
import "./styles.css";
import { AuthProvider } from "./auth-context.tsx";
import { RequireRole } from "./require-role.tsx";
import { AppShell } from "./AppShell.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage.tsx";
import { ResetPasswordPage } from "./pages/ResetPasswordPage.tsx";
import { ChangePasswordPage } from "./pages/ChangePasswordPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { ProfilePage } from "./pages/ProfilePage.tsx";
import { AdminUsersPage } from "./pages/AdminUsersPage.tsx";
import { AuditLogPage } from "./pages/AuditLogPage.tsx";
import { AdminClassesPage } from "./pages/AdminClassesPage.tsx";
import { AdminClassPage } from "./pages/AdminClassPage.tsx";
import { TeacherClassesPage } from "./pages/TeacherClassesPage.tsx";
import { TeacherClassPage } from "./pages/TeacherClassPage.tsx";
import { TeacherGradebookPage } from "./pages/TeacherGradebookPage.tsx";
import { AssignmentPage } from "./pages/AssignmentPage.tsx";
import { GradePage } from "./pages/GradePage.tsx";
import { StudentClassesPage } from "./pages/StudentClassesPage.tsx";
import { StudentClassPage } from "./pages/StudentClassPage.tsx";
import { ResultPage } from "./pages/ResultPage.tsx";

function Shell() {
  return (
    <AppShell>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route
          path="/admin/users"
          element={
            <RequireRole roles={["ADMIN"]}>
              <AdminUsersPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/audit-logs"
          element={
            <RequireRole roles={["ADMIN"]}>
              <AuditLogPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/classes"
          element={
            <RequireRole roles={["ADMIN"]}>
              <AdminClassesPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/classes/:id"
          element={
            <RequireRole roles={["ADMIN"]}>
              <AdminClassPage />
            </RequireRole>
          }
        />
        <Route
          path="/teacher/classes"
          element={
            <RequireRole roles={["TEACHER"]}>
              <TeacherClassesPage />
            </RequireRole>
          }
        />
        <Route
          path="/teacher/classes/:id"
          element={
            <RequireRole roles={["TEACHER"]}>
              <TeacherClassPage />
            </RequireRole>
          }
        />
        <Route
          path="/teacher/classes/:id/gradebook"
          element={
            <RequireRole roles={["TEACHER"]}>
              <TeacherGradebookPage />
            </RequireRole>
          }
        />
        <Route
          path="/teacher/assignments/:assignmentId"
          element={
            <RequireRole roles={["TEACHER"]}>
              <AssignmentPage role="TEACHER" />
            </RequireRole>
          }
        />
        <Route
          path="/teacher/assignments/:assignmentId/submissions/:submissionId/grade"
          element={
            <RequireRole roles={["TEACHER"]}>
              <GradePage />
            </RequireRole>
          }
        />
        <Route
          path="/student/classes"
          element={
            <RequireRole roles={["STUDENT"]}>
              <StudentClassesPage />
            </RequireRole>
          }
        />
        <Route
          path="/student/classes/:id"
          element={
            <RequireRole roles={["STUDENT"]}>
              <StudentClassPage />
            </RequireRole>
          }
        />
        <Route
          path="/student/assignments/:assignmentId"
          element={
            <RequireRole roles={["STUDENT"]}>
              <AssignmentPage role="STUDENT" />
            </RequireRole>
          }
        />
        <Route
          path="/student/assignments/:assignmentId/result"
          element={
            <RequireRole roles={["STUDENT"]}>
              <ResultPage />
            </RequireRole>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/*" element={<Shell />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
```

Note: `AppShell` no longer takes a `user` prop (it reads `useAuth()` itself — see Task 8) and no longer takes a single `children` page element from hand-rolled matching; it renders its own nested `<Routes>`. `/login`, `/forgot-password`, `/reset-password`, `/change-password` stay outside `AppShell` (no sidebar on unauthenticated/auth-flow pages, matching current behavior where those pages render standalone).

`must_change_password` redirect logic (previously in `main.tsx`'s `render()`) moves into `ChangePasswordPage`/`AppShell` — handled in Task 11.

- [ ] **Step 3: Build to confirm all imports resolve (pages not yet created will fail — this step is revisited as a checkpoint after Tasks 8–27, not expected to pass yet)**

```bash
cd frontend && npx tsc --noEmit
```

Expected at this point: FAIL, with errors naming `ForgotPasswordPage`, `ResetPasswordPage`, `DashboardPage`, `NotFoundPage` as missing modules (these are created in Tasks 9, 10, 12, 13). This is expected — do not attempt to fix by stubbing; those tasks create the real files next.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/main.tsx
git commit -m "feat: replace full-reload routing with React Router route table"
```

(Building/testing the full app is only meaningful once Tasks 8–27 land; this commit is intentionally a checkpoint in an interim broken-build state, consistent with the rest of this plan's task ordering. If your workflow requires green-build-per-commit, hold Task 7's commit until Task 13 lands instead — do not skip writing the route table now, since later page tasks depend on reading it.)

---

## Task 8: Rebuild `AppShell`

**Files:**
- Modify: `frontend/src/AppShell.tsx` (rewrite: drop `user` prop, read `useAuth()`; drop `children` full-page-element prop, render nested `<Routes>` — actually accepts `children: ReactNode` still, but now that's the `<Routes>` block passed from `main.tsx`'s `Shell()`, not a resolved single element)

**Interfaces:**
- Consumes: `useAuth()` (Task 5), `Link`/`NavLink` from `react-router-dom` (replacing raw `<a href>` tags so navigation doesn't full-reload), `HomeIcon` (Task 4).
- Produces: same nav link data shape as before, `links: Record<Role, [href, label, Icon][]>`, but with `/admin/password-reset-requests` entry removed and a `/dashboard` "Trang chủ" (HomeIcon) entry prepended for every role.

- [ ] **Step 1: Read current `AppShell.tsx` in full**

```bash
cat frontend/src/AppShell.tsx
```

- [ ] **Step 2: Rewrite**, preserving: mobile topbar, collapsible drawer with backdrop + Escape-key/body-scroll-lock (`useState` for `drawerOpen`, same `useEffect`), notifications `<details>` block gated on `user.role !== "ADMIN"`, logout button. Changes: `user` comes from `useAuth()` not props; nav `<a>` tags become `<NavLink>` (so the current route highlights and clicking doesn't reload); `links` map gets a `/dashboard` entry prepended to every role's array and the `/admin/password-reset-requests` entry deleted from `ADMIN`; Bootstrap classes (`d-flex`, `nav-pills`, etc.) replaced with Tailwind equivalents; logout still calls the existing `logout()` from `auth.tsx` then navigates to `/login` via `useNavigate()` instead of `location.assign`.

```tsx
import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "./auth-context.tsx";
import { logout } from "./auth.tsx";
import { listNotifications } from "./notifications.ts";
import {
  MenuIcon, CloseIcon, HomeIcon, UsersIcon, BookIcon, ClipboardIcon, UserIcon, BellIcon, LogoutIcon,
} from "./components/icons.tsx";
import type { Role } from "./session.ts";
import type { ReactNode } from "react";

const links: Record<Role, [string, string, typeof HomeIcon][]> = {
  ADMIN: [
    ["/dashboard", "Trang chủ", HomeIcon],
    ["/admin/users", "Tài khoản", UsersIcon],
    ["/admin/classes", "Lớp học", BookIcon],
    ["/admin/audit-logs", "Nhật ký", ClipboardIcon],
  ],
  TEACHER: [
    ["/dashboard", "Trang chủ", HomeIcon],
    ["/teacher/classes", "Lớp của tôi", BookIcon],
    ["/profile", "Hồ sơ cá nhân", UserIcon],
  ],
  STUDENT: [
    ["/dashboard", "Trang chủ", HomeIcon],
    ["/student/classes", "Lớp của tôi", BookIcon],
    ["/profile", "Hồ sơ cá nhân", UserIcon],
  ],
};

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState<Awaited<ReturnType<typeof listNotifications>>>([]);

  useEffect(() => {
    if (!user || user.role === "ADMIN") return;
    listNotifications().then(setNotifications).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  if (loading) return <div className="p-8 text-slate-500">Đang tải...</div>;
  if (!user) return null; // RequireRole on each nested route redirects to /login

  const unread = notifications.filter((n) => !n.read_at).length;
  const navLinks = links[user.role];

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white p-3 md:hidden">
        <button aria-label="Mở menu" onClick={() => setDrawerOpen(true)}>
          <MenuIcon className="h-6 w-6" />
        </button>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setDrawerOpen(false)} />
      ) : null}

      <aside
        className={`fixed z-50 h-full w-64 border-r border-slate-200 bg-white p-4 transition-transform md:static md:translate-x-0 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-4 flex items-center justify-between md:hidden">
          <span className="font-semibold">Menu</span>
          <button aria-label="Đóng menu" onClick={() => setDrawerOpen(false)}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-col gap-1">
          {navLinks.map(([href, label, Icon]) => (
            <NavLink
              key={href}
              to={href}
              onClick={() => setDrawerOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        {user.role !== "ADMIN" ? (
          <details className="mt-4">
            <summary className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <BellIcon className="h-4 w-4" />
              Thông báo {unread > 0 ? <Badge>{unread}</Badge> : null}
            </summary>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {notifications.map((n) => (
                <li key={n.id} className="rounded p-2 hover:bg-slate-50">
                  {n.title}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <button
          onClick={handleLogout}
          className="mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <LogoutIcon className="h-4 w-4" />
          Đăng xuất
        </button>
      </aside>

      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
```

Remove the stray `<Badge>` usage above if `components/ui/Badge` isn't imported yet — import it: `import { Badge } from "./components/ui/Badge";`.

- [ ] **Step 3: Write/update `AppShell` test**

Read the existing `AppShell` test file if one exists (`frontend/src/AppShell.test.tsx` — check with `ls frontend/src/AppShell*`); if none exists, create one:

```tsx
// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { screen } from "@testing-library/react";
import { vi } from "vitest";
import { AppShell } from "./AppShell";
import { renderWithProviders } from "./test-utils";

vi.mock("./notifications.ts", () => ({ listNotifications: vi.fn().mockResolvedValue([]) }));
vi.mock("./auth.tsx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./auth.tsx")>()),
  logout: vi.fn().mockResolvedValue(undefined),
}));

const adminUser = { id: 1, email: "a@x.com", role: "ADMIN" as const, full_name: null, phone: null, date_of_birth: null, gender: null, address: null, is_active: true };

describe("AppShell", () => {
  test("renders dashboard nav link for every role and hides password-reset-requests link", () => {
    renderWithProviders(<AppShell>content</AppShell>, { user: adminUser });
    expect(screen.getByRole("link", { name: /trang chủ/i })).toBeInTheDocument();
    expect(screen.queryByText(/password.reset/i)).not.toBeInTheDocument();
  });

  test("hides notifications for ADMIN role", () => {
    renderWithProviders(<AppShell>content</AppShell>, { user: adminUser });
    expect(screen.queryByText(/thông báo/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/AppShell.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/AppShell.tsx frontend/src/AppShell.test.tsx
git commit -m "feat: rebuild AppShell on Tailwind + React Router, add dashboard nav link"
```

---

## Task 9: `validate()` convention + rebuild `LoginPage` (template for all subsequent form pages)

This task fully rebuilds one page end-to-end as the concrete template every later form-page task follows: controlled state, `noValidate` + `validate()`, `Field`/`Alert`/`Button` primitives, RTL test asserting the "field values survive submit failure" rule from Global Constraints.

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx` (rewrite: currently reads `FormData` uncontrolled — moves to controlled state per Global Constraints)
- Modify: `frontend/src/pages/LoginPage.test.tsx` (or create if none exists — check first)

**Interfaces:**
- Consumes: `login(email, password)` from `auth.tsx` (existing, unchanged signature), `useAuth().refresh` (Task 5), `ApiFailure` shape from `api.ts`.
- Produces: the `validate(draft) => Record<string, string>` pattern every later page task reuses verbatim in shape.

- [ ] **Step 1: Read current `LoginPage.tsx` in full**

```bash
cat frontend/src/pages/LoginPage.tsx
```

- [ ] **Step 2: Write the failing test** (adjust field labels/copy to match whatever the current page actually renders, found in Step 1 — the assertions below assume Vietnamese "Email"/"Mật khẩu" labels consistent with `AppShell`'s copy; confirm against the real file)

```tsx
// @vitest-environment jsdom
import { describe, expect, test, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginPage } from "./LoginPage";
import { renderWithProviders } from "../test-utils";

vi.mock("../auth.tsx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth.tsx")>()),
  login: vi.fn(),
}));

import { login } from "../auth.tsx";

describe("LoginPage", () => {
  beforeEach(() => vi.mocked(login).mockReset());

  test("shows inline validation error and keeps typed email when password left blank", async () => {
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/email/i), "user@example.com");
    fireEvent.click(screen.getByRole("button", { name: /đăng nhập/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/mật khẩu/i);
    expect(screen.getByLabelText(/email/i)).toHaveValue("user@example.com");
    expect(login).not.toHaveBeenCalled();
  });

  test("keeps field values and shows server error on ApiFailure", async () => {
    vi.mocked(login).mockRejectedValue({ status: 400, detail: "Sai email hoặc mật khẩu" });
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/email/i), "user@example.com");
    await userEvent.type(screen.getByLabelText(/mật khẩu/i), "wrongpass");
    fireEvent.click(screen.getByRole("button", { name: /đăng nhập/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Sai email hoặc mật khẩu"));
    expect(screen.getByLabelText(/email/i)).toHaveValue("user@example.com");
    expect(screen.getByLabelText(/mật khẩu/i)).toHaveValue("wrongpass");
  });

  test("has a link to /forgot-password", () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByRole("link", { name: /quên mật khẩu/i })).toHaveAttribute("href", "/forgot-password");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
cd frontend && npx vitest run src/pages/LoginPage.test.tsx
```

Expected: FAIL (old uncontrolled implementation doesn't match label queries / no forgot-password link).

- [ ] **Step 4: Implement**

```tsx
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../auth.tsx";
import { roleHome } from "../session.ts";
import { useAuth } from "../auth-context.tsx";
import { Field } from "../components/ui/Field";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import type { ApiFailure } from "../api.ts";

type Draft = { email: string; password: string };

function validate(draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.email.trim()) errors.email = "Vui lòng nhập email";
  if (!draft.password) errors.password = "Vui lòng nhập mật khẩu";
  return errors;
}

export function LoginPage() {
  const [draft, setDraft] = useState<Draft>({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const fieldErrors = validate(draft);
    setErrors(fieldErrors);
    setDetail(null);
    if (Object.keys(fieldErrors).length > 0) return;

    setPending(true);
    try {
      const user = await login(draft.email, draft.password);
      await refresh();
      if (user.must_change_password) {
        navigate("/change-password");
      } else {
        navigate(roleHome(user.role));
      }
    } catch (err) {
      const failure = err as ApiFailure;
      setDetail(failure.detail);
      setErrors(failure.fields ? Object.fromEntries(Object.entries(failure.fields).map(([k, v]) => [k, v[0]])) : {});
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-lg font-semibold">Đăng nhập</h1>
        {detail ? (
          <div className="mb-4">
            <Alert tone="error">{detail}</Alert>
          </div>
        ) : null}
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="email" error={errors.email}>
            <input
              id="email"
              type="email"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </Field>
          <Field label="Mật khẩu" htmlFor="password" error={errors.password}>
            <input
              id="password"
              type="password"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={draft.password}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </form>
        <Link to="/forgot-password" className="mt-3 inline-block text-sm text-brand-600 hover:underline">
          Quên mật khẩu?
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/LoginPage.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx frontend/src/pages/LoginPage.test.tsx
git commit -m "feat: rebuild LoginPage on Tailwind with controlled inline validation"
```

---

## Task 10: `ForgotPasswordPage` (new)

**Files:**
- Create: `frontend/src/pages/ForgotPasswordPage.tsx`
- Create: `frontend/src/pages/ForgotPasswordPage.test.tsx`

**Interfaces:**
- Consumes: `requestPasswordReset(email)` from `auth.tsx` (existing export, reused as-is per contract — always resolves on `204`, no account-enumeration signal).
- Produces: no exports consumed elsewhere; routed at `/forgot-password` in Task 7.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, expect, test, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForgotPasswordPage } from "./ForgotPasswordPage";
import { renderWithProviders } from "../test-utils";

vi.mock("../auth.tsx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth.tsx")>()),
  requestPasswordReset: vi.fn(),
}));

import { requestPasswordReset } from "../auth.tsx";

describe("ForgotPasswordPage", () => {
  beforeEach(() => vi.mocked(requestPasswordReset).mockReset());

  test("submits email and shows check-your-email notice regardless of account existence", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue(undefined);
    renderWithProviders(<ForgotPasswordPage />);
    await userEvent.type(screen.getByLabelText(/email/i), "someone@example.com");
    fireEvent.click(screen.getByRole("button", { name: /gửi/i }));
    await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledWith("someone@example.com"));
    expect(await screen.findByText(/kiểm tra email/i)).toBeInTheDocument();
  });

  test("shows validation error and does not call API when email is blank", () => {
    renderWithProviders(<ForgotPasswordPage />);
    fireEvent.click(screen.getByRole("button", { name: /gửi/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/email/i);
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  test("has a link back to /login", () => {
    renderWithProviders(<ForgotPasswordPage />);
    expect(screen.getByRole("link", { name: /đăng nhập/i })).toHaveAttribute("href", "/login");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npx vitest run src/pages/ForgotPasswordPage.test.tsx
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```tsx
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../auth.tsx";
import { Field } from "../components/ui/Field";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";

function validate(email: string): Record<string, string> {
  return email.trim() ? {} : { email: "Vui lòng nhập email" };
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const fieldErrors = validate(email);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;
    setPending(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-lg font-semibold">Quên mật khẩu</h1>
        {sent ? (
          <Alert tone="success">Nếu email tồn tại, chúng tôi đã gửi liên kết đặt lại mật khẩu. Vui lòng kiểm tra email của bạn.</Alert>
        ) : (
          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Email" htmlFor="email" error={errors.email}>
              <input
                id="email"
                type="email"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang gửi..." : "Gửi liên kết đặt lại"}
            </Button>
          </form>
        )}
        <Link to="/login" className="mt-3 inline-block text-sm text-brand-600 hover:underline">
          Quay lại đăng nhập
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/ForgotPasswordPage.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ForgotPasswordPage.tsx frontend/src/pages/ForgotPasswordPage.test.tsx
git commit -m "feat: add ForgotPasswordPage"
```

---

## Task 11: `resetPassword()` API call + `ResetPasswordPage` (new)

**Files:**
- Modify: `frontend/src/auth.tsx` (add `resetPassword(token, password)`)
- Create: `frontend/src/pages/ResetPasswordPage.tsx`
- Create: `frontend/src/pages/ResetPasswordPage.test.tsx`

**Interfaces:**
- Produces: `export const resetPassword = (token: string, password: string) => api<void>(\`/password-reset/${token}\`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ password }) });` — matches the API contract's `POST /password-reset/:token` returning `204`, or `404`/`410` with `{ detail }`.
- Consumes: `useSearchParams()` from `react-router-dom` to read `?token=...`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, expect, test, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { renderWithProviders } from "../test-utils";

vi.mock("../auth.tsx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth.tsx")>()),
  resetPassword: vi.fn(),
}));

import { resetPassword } from "../auth.tsx";

describe("ResetPasswordPage", () => {
  beforeEach(() => vi.mocked(resetPassword).mockReset());

  test("submits new password with token from query string", async () => {
    vi.mocked(resetPassword).mockResolvedValue(undefined);
    renderWithProviders(<ResetPasswordPage />, { route: "/reset-password?token=abc123" });
    await userEvent.type(screen.getByLabelText(/mật khẩu mới/i), "newpassword1");
    fireEvent.click(screen.getByRole("button", { name: /đặt lại/i }));
    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith("abc123", "newpassword1"));
  });

  test("shows expired/invalid token error from ApiFailure and keeps entered password", async () => {
    vi.mocked(resetPassword).mockRejectedValue({ status: 410, detail: "Liên kết đã hết hạn" });
    renderWithProviders(<ResetPasswordPage />, { route: "/reset-password?token=expired" });
    await userEvent.type(screen.getByLabelText(/mật khẩu mới/i), "newpassword1");
    fireEvent.click(screen.getByRole("button", { name: /đặt lại/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Liên kết đã hết hạn"));
    expect(screen.getByLabelText(/mật khẩu mới/i)).toHaveValue("newpassword1");
  });

  test("validates minimum password length client-side before calling API", () => {
    renderWithProviders(<ResetPasswordPage />, { route: "/reset-password?token=abc" });
    fireEvent.change(screen.getByLabelText(/mật khẩu mới/i), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: /đặt lại/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/8 ký tự/i);
    expect(resetPassword).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npx vitest run src/pages/ResetPasswordPage.test.tsx
```

Expected: FAIL — module and `resetPassword` export don't exist.

- [ ] **Step 3: Add `resetPassword` to `auth.tsx`**

Read the current file first (`cat frontend/src/auth.tsx`) and add, following the exact pattern of the existing `requestPasswordReset`/`changePassword` exports:

```ts
export const resetPassword = (token: string, password: string) =>
  api<void>(`/password-reset/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
```

- [ ] **Step 4: Implement `ResetPasswordPage.tsx`**

```tsx
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "../auth.tsx";
import { Field } from "../components/ui/Field";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import type { ApiFailure } from "../api.ts";

function validate(password: string): Record<string, string> {
  if (password.length < 8) return { password: "Mật khẩu phải có ít nhất 8 ký tự" };
  return {};
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const fieldErrors = validate(password);
    setErrors(fieldErrors);
    setDetail(null);
    if (Object.keys(fieldErrors).length > 0) return;
    setPending(true);
    try {
      await resetPassword(token, password);
      navigate("/login", { state: { notice: "Đặt lại mật khẩu thành công. Vui lòng đăng nhập." } });
    } catch (err) {
      const failure = err as ApiFailure;
      setDetail(failure.detail);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-lg font-semibold">Đặt lại mật khẩu</h1>
        {detail ? (
          <div className="mb-4">
            <Alert tone="error">{detail}</Alert>
          </div>
        ) : null}
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Mật khẩu mới" htmlFor="password" error={errors.password}>
            <input
              id="password"
              type="password"
              maxLength={128}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Đang lưu..." : "Đặt lại mật khẩu"}
          </Button>
        </form>
        <Link to="/login" className="mt-3 inline-block text-sm text-brand-600 hover:underline">
          Quay lại đăng nhập
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/ResetPasswordPage.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/auth.tsx frontend/src/pages/ResetPasswordPage.tsx frontend/src/pages/ResetPasswordPage.test.tsx
git commit -m "feat: add resetPassword API call and ResetPasswordPage"
```

---

## Task 12: Rebuild `ChangePasswordPage`

**Files:**
- Modify: `frontend/src/pages/ChangePasswordPage.tsx`
- Modify/create: `frontend/src/pages/ChangePasswordPage.test.tsx`

**Interfaces:**
- Consumes: `changePassword(current_password, new_password)` from `auth.tsx` (existing, unchanged), `useAuth().refresh` (to clear `must_change_password` in context state after success), `useNavigate()`.

- [ ] **Step 1: Read current implementation**

```bash
cat frontend/src/pages/ChangePasswordPage.tsx
```

- [ ] **Step 2: Write the failing test** (mirror Task 9/11's pattern: controlled fields, `validate()`, error preserves input, success path)

```tsx
// @vitest-environment jsdom
import { describe, expect, test, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangePasswordPage } from "./ChangePasswordPage";
import { renderWithProviders } from "../test-utils";

vi.mock("../auth.tsx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth.tsx")>()),
  changePassword: vi.fn(),
}));

import { changePassword } from "../auth.tsx";

const user = { id: 1, email: "a@x.com", role: "STUDENT" as const, full_name: null, phone: null, date_of_birth: null, gender: null, address: null, is_active: true };

describe("ChangePasswordPage", () => {
  beforeEach(() => vi.mocked(changePassword).mockReset());

  test("validates required fields without calling API", () => {
    renderWithProviders(<ChangePasswordPage />, { user });
    fireEvent.click(screen.getByRole("button", { name: /đổi mật khẩu/i }));
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(changePassword).not.toHaveBeenCalled();
  });

  test("navigates to /dashboard on success", async () => {
    vi.mocked(changePassword).mockResolvedValue(undefined);
    renderWithProviders(<ChangePasswordPage />, { user });
    await userEvent.type(screen.getByLabelText(/mật khẩu hiện tại/i), "oldpass1");
    await userEvent.type(screen.getByLabelText(/mật khẩu mới/i), "newpass123");
    fireEvent.click(screen.getByRole("button", { name: /đổi mật khẩu/i }));
    await waitFor(() => expect(changePassword).toHaveBeenCalledWith("oldpass1", "newpass123"));
  });

  test("keeps entered values on ApiFailure", async () => {
    vi.mocked(changePassword).mockRejectedValue({ status: 400, detail: "Mật khẩu hiện tại không đúng" });
    renderWithProviders(<ChangePasswordPage />, { user });
    await userEvent.type(screen.getByLabelText(/mật khẩu hiện tại/i), "wrongold1");
    await userEvent.type(screen.getByLabelText(/mật khẩu mới/i), "newpass123");
    fireEvent.click(screen.getByRole("button", { name: /đổi mật khẩu/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Mật khẩu hiện tại không đúng"));
    expect(screen.getByLabelText(/mật khẩu hiện tại/i)).toHaveValue("wrongold1");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
cd frontend && npx vitest run src/pages/ChangePasswordPage.test.tsx
```

- [ ] **Step 4: Implement**, following the Task 9 template exactly (controlled `draft` state for `current_password`/`new_password`, `validate()` requiring both non-empty and `new_password.length >= 8`, `Field`/`Alert`/`Button` primitives, `noValidate`), calling `changePassword(draft.current_password, draft.new_password)` then `await refresh()` then `navigate("/dashboard")` on success.

- [ ] **Step 5: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/ChangePasswordPage.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ChangePasswordPage.tsx frontend/src/pages/ChangePasswordPage.test.tsx
git commit -m "feat: rebuild ChangePasswordPage on Tailwind with controlled inline validation"
```

---

## Task 13: `DashboardPage` (new)

**Files:**
- Create: `frontend/src/pages/DashboardPage.tsx`
- Create: `frontend/src/pages/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `useAuth().user` (Task 5), `listClasses()` from `classes.ts` (existing — returns `Class[]` with `progress: { graded: number; total: number; nearest_deadline: string | null }` per spec), `listNotifications()` from `notifications.ts` (existing).
- Produces: no exports consumed elsewhere; routed at `/dashboard`.

- [ ] **Step 1: Read `listClasses()` and `listNotifications()` return types to confirm exact shape**

```bash
grep -n "listClasses\|Class =" frontend/src/classes.ts
grep -n "listNotifications\|Notification" frontend/src/notifications.ts
```

- [ ] **Step 2: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { DashboardPage } from "./DashboardPage";
import { renderWithProviders } from "../test-utils";

vi.mock("../classes.ts", () => ({
  listClasses: vi.fn().mockResolvedValue([
    { id: 1, name: "Toán 10A", progress: { graded: 3, total: 5, nearest_deadline: "2026-08-01T00:00:00Z" } },
  ]),
}));
vi.mock("../notifications.ts", () => ({
  listNotifications: vi.fn().mockResolvedValue([{ id: 1, title: "Bài mới", read_at: null, link: "/x" }]),
}));

const student = { id: 1, email: "s@x.com", role: "STUDENT" as const, full_name: "Học sinh A", phone: null, date_of_birth: null, gender: null, address: null, is_active: true };

describe("DashboardPage", () => {
  test("renders classes-with-progress card and unread notifications for a student", async () => {
    renderWithProviders(<DashboardPage />, { user: student });
    await waitFor(() => expect(screen.getByText("Toán 10A")).toBeInTheDocument());
    expect(screen.getByText(/3\s*\/\s*5/)).toBeInTheDocument();
    expect(screen.getByText("Bài mới")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
cd frontend && npx vitest run src/pages/DashboardPage.test.tsx
```

- [ ] **Step 4: Implement**

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth-context.tsx";
import { listClasses, type Class } from "../classes.ts";
import { listNotifications, type Notification } from "../notifications.ts";
import { Card } from "../components/ui/Card";
import { Spinner } from "../components/ui/Spinner";
import { EmptyState } from "../components/ui/EmptyState";

const classDetailPath: Record<string, (id: number) => string> = {
  ADMIN: (id) => `/admin/classes/${id}`,
  TEACHER: (id) => `/teacher/classes/${id}`,
  STUDENT: (id) => `/student/classes/${id}`,
};

export function DashboardPage() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<Class[] | null>(null);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);

  useEffect(() => {
    if (!user) return;
    listClasses().then(setClasses).catch(() => setClasses([]));
    if (user.role !== "ADMIN") {
      listNotifications().then(setNotifications).catch(() => setNotifications([]));
    } else {
      setNotifications([]);
    }
  }, [user]);

  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Xin chào, {user.full_name ?? user.email}</h1>

      <Card>
        <h2 className="mb-3 font-medium">Lớp học của tôi</h2>
        {classes === null ? (
          <Spinner />
        ) : classes.length === 0 ? (
          <EmptyState title="Chưa có lớp học" />
        ) : (
          <ul className="flex flex-col gap-2">
            {classes.map((c) => (
              <li key={c.id}>
                <Link to={classDetailPath[user.role](c.id)} className="flex items-center justify-between rounded-md p-2 hover:bg-slate-50">
                  <span>{c.name}</span>
                  {c.progress ? (
                    <span className="text-sm text-slate-500">
                      {c.progress.graded} / {c.progress.total} đã chấm
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {user.role !== "ADMIN" ? (
        <Card>
          <h2 className="mb-3 font-medium">Thông báo chưa đọc</h2>
          {notifications === null ? (
            <Spinner />
          ) : notifications.filter((n) => !n.read_at).length === 0 ? (
            <EmptyState title="Không có thông báo mới" />
          ) : (
            <ul className="flex flex-col gap-2">
              {notifications
                .filter((n) => !n.read_at)
                .map((n) => (
                  <li key={n.id}>
                    <Link to={n.link} className="block rounded-md p-2 hover:bg-slate-50">
                      {n.title}
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
```

(Confirm `Class`/`Notification` type export names and exact field names against Step 1's grep output before finalizing — adjust `progress`/`nearest_deadline`/`read_at`/`link` field access to match reality if they differ.)

- [ ] **Step 5: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/DashboardPage.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx frontend/src/pages/DashboardPage.test.tsx
git commit -m "feat: add role-aware DashboardPage"
```

---

## Task 14: `NotFoundPage` (new)

**Files:**
- Create: `frontend/src/pages/NotFoundPage.tsx`
- Create: `frontend/src/pages/NotFoundPage.test.tsx`

**Interfaces:**
- Consumes: `CompassIcon` (Task 4), `useAuth().user` (to link "back home" to `/dashboard` if logged in, `/login` otherwise).

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { screen } from "@testing-library/react";
import { NotFoundPage } from "./NotFoundPage";
import { renderWithProviders } from "../test-utils";

const user = { id: 1, email: "a@x.com", role: "ADMIN" as const, full_name: null, phone: null, date_of_birth: null, gender: null, address: null, is_active: true };

describe("NotFoundPage", () => {
  test("shows 404 message and a link to /dashboard when logged in", () => {
    renderWithProviders(<NotFoundPage />, { user });
    expect(screen.getByText(/404/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /trang chủ/i })).toHaveAttribute("href", "/dashboard");
  });

  test("links to /login when not logged in", () => {
    renderWithProviders(<NotFoundPage />, { user: null });
    expect(screen.getByRole("link", { name: /trang chủ|đăng nhập/i })).toHaveAttribute("href", "/login");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npx vitest run src/pages/NotFoundPage.test.tsx
```

- [ ] **Step 3: Implement**

```tsx
import { Link } from "react-router-dom";
import { useAuth } from "../auth-context.tsx";
import { CompassIcon } from "../components/icons.tsx";

export function NotFoundPage() {
  const { user } = useAuth();
  const homeHref = user ? "/dashboard" : "/login";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-4 text-center">
      <CompassIcon className="h-12 w-12 text-slate-400" />
      <h1 className="text-2xl font-semibold">404 — Không tìm thấy trang</h1>
      <p className="text-slate-500">Trang bạn tìm không tồn tại hoặc đã được di chuyển.</p>
      <Link to={homeHref} className="text-brand-600 hover:underline">
        {user ? "Về trang chủ" : "Về trang đăng nhập"}
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/NotFoundPage.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/NotFoundPage.tsx frontend/src/pages/NotFoundPage.test.tsx
git commit -m "feat: add 404 NotFoundPage"
```

---

## Task 15: Full build/test checkpoint after auth + dashboard + 404

All imports `main.tsx` needs are now real files (Login, ForgotPassword, ResetPassword, ChangePassword, Dashboard, NotFound). Admin/teacher/student pages still exist as their pre-rebuild Bootstrap versions and are imported as-is — this checkpoint confirms the app boots end-to-end before continuing page-by-page migration.

**Files:** none created/modified — verification-only task.

- [ ] **Step 1: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS (or errors only inside not-yet-migrated pages if they reference something routing changed — fix only routing-integration issues, not visual/Bootstrap issues, which are out of scope until each page's own task).

- [ ] **Step 2: Run full test suite**

```bash
cd frontend && npm test
```

Expected: new tests (Tasks 3–14) PASS; old hand-rolled-mock tests for not-yet-migrated pages (Admin*, Teacher*, Student*, Profile, AuditLog, Grade, Assignment, Result) still PASS unchanged, since those pages haven't been touched yet.

- [ ] **Step 3: Manual smoke test**

```bash
cd frontend && npm run dev
```

Open the app, log in, confirm: sidebar nav works without full page reload, `/dashboard` renders, an unknown URL shows the 404 page, `/forgot-password` and `/reset-password?token=x` render (reset will fail against the real backend until Task 29+ lands — that's expected at this point).

No commit — this task is a gate, not a change.

---

## Task 16: `resetUserPassword()` + rebuild `AdminUsersPage` with reset-password modal

**Files:**
- Modify: `frontend/src/classes.ts` (add `resetUserPassword`)
- Modify: `frontend/src/pages/AdminUsersPage.tsx`
- Modify: `frontend/src/pages/AdminUsersPage.test.tsx`
- Modify: `frontend/src/pages/AdminUsersPage.focus.test.tsx` (if it exists — check first; it tests `AppDialog` focus-restore behavior, which must keep passing since `AppDialog`'s logic is unchanged, only classes)

**Interfaces:**
- Produces: `export const resetUserPassword = (id: number, password: string) => api<User>(\`/users/${id}/reset-password\`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ password }) });` in `classes.ts`, alongside the other admin user-management calls per spec.
- Consumes: `AppDialog` (Task 8's markup is unchanged in logic; only class swaps happen here as part of this page's own Tailwind pass since `AdminUsersPage` is the dialog's only current caller), `KeyIcon` (existing icon, repurposed from the removed nav link to this row action per spec).

- [ ] **Step 1: Read current `AdminUsersPage.tsx` in full**, including the inline `api()`/`apiResponse()` calls for list/create/update/delete users mentioned in the investigation (POST `/users`, PATCH `/users/:id`, DELETE `/users/:id`) and the existing dialog usage pattern.

```bash
cat frontend/src/pages/AdminUsersPage.tsx
cat frontend/src/pages/AdminUsersPage.test.tsx
```

- [ ] **Step 2: Add `resetUserPassword` to `classes.ts`**, next to `listTeachers`/`listStudentAccounts`:

```ts
export const resetUserPassword = (id: number, password: string) =>
  api<User>(`/users/${id}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
```

- [ ] **Step 3: Write the failing test for the new reset-password modal** (append to the existing test file, keeping current CRUD tests intact per "test intent preserved" — only add new cases + update Bootstrap-specific query patterns if the existing tests query by class name rather than role/label)

```tsx
test("clicking reset-password icon on a row opens modal; submitting calls resetUserPassword and closes modal", async () => {
  vi.mocked(resetUserPassword).mockResolvedValue({ id: 5, email: "u@x.com", role: "STUDENT", full_name: null, phone: null, date_of_birth: null, gender: null, address: null, is_active: true });
  // ...render page with a seeded user list including id 5, then:
  fireEvent.click(screen.getByRole("button", { name: /đặt lại mật khẩu.*u@x.com/i }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText(/mật khẩu mới/i), "newpassword1");
  fireEvent.click(screen.getByRole("button", { name: /lưu/i }));
  await waitFor(() => expect(resetUserPassword).toHaveBeenCalledWith(5, "newpassword1"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
```

(Adjust seed data / row query text to match whatever the actual current row markup looks like once you've read it in Step 1 — the accessible name for the reset icon button should include the user's identifying text, e.g. `aria-label={\`Đặt lại mật khẩu cho ${u.email}\`}`.)

- [ ] **Step 4: Run to verify the new test fails**

```bash
cd frontend && npx vitest run src/pages/AdminUsersPage.test.tsx
```

- [ ] **Step 5: Implement** — re-skin the page's table/toolbar/forms onto `Table`/`Card`/`Button`/`Field`/`Badge` primitives (Bootstrap → Tailwind, 1:1 behavior), add a per-row `<button aria-label={...}><KeyIcon className="h-4 w-4" /></button>` that opens a new local `resetPasswordTarget: User | null` state driving an `<AppDialog>` with a single `Field` (new password) + `formId` wired submit calling `resetUserPassword(target.id, password)`, closing the dialog and clearing `resetPasswordTarget` on success, showing `Alert` on `ApiFailure`. Keep all existing create/update/deactivate logic and its error handling untouched — only markup and the new modal are additions.

- [ ] **Step 6: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/AdminUsersPage.test.tsx src/pages/AdminUsersPage.focus.test.tsx
```

Expected: PASS, including pre-existing tests.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/classes.ts frontend/src/pages/AdminUsersPage.tsx frontend/src/pages/AdminUsersPage.test.tsx
git commit -m "feat: add per-row reset-password modal to AdminUsersPage, rebuild on Tailwind"
```

---

## Task 17: Remove `PasswordResetRequestsPage` and its route

**Files:**
- Delete: `frontend/src/pages/PasswordResetRequestsPage.tsx`
- Delete: any `frontend/src/pages/PasswordResetRequestsPage.test.tsx` if present
- Modify: `frontend/src/main.tsx` (already excludes this route as of Task 7 — this task is the cleanup/deletion of the now-dead file)
- Modify: `frontend/src/session.ts` (remove `/admin/password-reset-requests` from `canAccess`'s ADMIN branch — investigation found it was never actually in that regex, so this is a no-op verification, not a change; confirm and note in commit if no change needed)

- [ ] **Step 1: Confirm no remaining references**

```bash
grep -rn "PasswordResetRequestsPage\|password-reset-requests" frontend/src
```

Expected after Task 7 + Task 8: only the old page file and its test remain as dead code (nav link and route are already gone).

- [ ] **Step 2: Delete the files**

```bash
git rm frontend/src/pages/PasswordResetRequestsPage.tsx
git rm frontend/src/pages/PasswordResetRequestsPage.test.tsx 2>/dev/null || true
```

- [ ] **Step 3: Verify**

```bash
cd frontend && npx tsc --noEmit && npm test
```

Expected: PASS, no broken imports.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove admin password-reset-requests page (replaced by self-service flow)"
```

---

## Task 18: Rebuild `AuditLogPage`

**Files:**
- Modify: `frontend/src/pages/AuditLogPage.tsx`
- Modify: `frontend/src/pages/AuditLogPage.test.tsx` (or create if none exists)

**Interfaces:** no new interfaces — pure re-skin + `useParams()`/RTL migration if the page reads any route state (investigation found none: no props/params).

- [ ] **Step 1: Read current file and test**

```bash
cat frontend/src/pages/AuditLogPage.tsx
ls frontend/src/pages/AuditLogPage.test.tsx 2>/dev/null && cat frontend/src/pages/AuditLogPage.test.tsx
```

- [ ] **Step 2: Rewrite the test with `@testing-library/react` + `renderWithProviders`**, preserving the same behavioral assertions the current hand-rolled-mock test makes (read Step 1's output to enumerate exactly which behaviors are currently asserted: list rendering, filters, pagination, empty state — whatever exists) but querying by role/label/text instead of walking the React element tree.

- [ ] **Step 3: Run to verify it fails against old markup**

```bash
cd frontend && npx vitest run src/pages/AuditLogPage.test.tsx
```

- [ ] **Step 4: Re-skin the page** onto `Table`/`Card`/`EmptyState`/`Spinner` primitives, converting any Bootstrap form controls used for filters to `Field` + `noValidate` if the page has a filter form with native validation attributes; keep all existing fetch/filter/pagination logic unchanged.

- [ ] **Step 5: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/AuditLogPage.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AuditLogPage.tsx frontend/src/pages/AuditLogPage.test.tsx
git commit -m "feat: rebuild AuditLogPage on Tailwind, migrate test to testing-library"
```

---

## Task 19: Rebuild `AdminClassesPage`

**Files:**
- Modify: `frontend/src/pages/AdminClassesPage.tsx`
- Modify: `frontend/src/pages/AdminClassesPage.test.tsx`, `frontend/src/pages/AdminClassesPage.ui.test.tsx` (both exist per investigation — migrate both)

**Interfaces:** exports `toDateTimeLocal(value)`, `toUtcIso(value)` stay as-is (pure helper functions, no styling dependency — do not change their signatures, other pages/tests may import them).

- [ ] **Step 1: Read current file + both test files**

```bash
cat frontend/src/pages/AdminClassesPage.tsx
cat frontend/src/pages/AdminClassesPage.test.tsx frontend/src/pages/AdminClassesPage.ui.test.tsx
```

- [ ] **Step 2: Rewrite both test files** with `@testing-library/react` + `renderWithProviders`, preserving current test intent (list/create/edit class behavior, whatever the `.ui.test.tsx` file specifically covers — likely dialog/focus interactions given the naming convention matches `AdminUsersPage.focus.test.tsx`).

- [ ] **Step 3: Run to verify failure against old markup**

```bash
cd frontend && npx vitest run src/pages/AdminClassesPage.test.tsx src/pages/AdminClassesPage.ui.test.tsx
```

- [ ] **Step 4: Re-skin the page** onto `Table`/`Card`/`Field`/`Button`/`AppDialog`, converting the class create/edit form to `noValidate` + `validate()` per Global Constraints, keeping `toDateTimeLocal`/`toUtcIso` and all datetime-handling logic untouched.

- [ ] **Step 5: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/AdminClassesPage.test.tsx src/pages/AdminClassesPage.ui.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AdminClassesPage.tsx frontend/src/pages/AdminClassesPage.test.tsx frontend/src/pages/AdminClassesPage.ui.test.tsx
git commit -m "feat: rebuild AdminClassesPage on Tailwind, migrate tests to testing-library"
```

---

## Task 20: Rebuild `AdminClassPage` with `useParams()`

**Files:**
- Modify: `frontend/src/pages/AdminClassPage.tsx` (currently reads `classId` from `Number(location.pathname.split("/").pop())` at **module scope** — this is the key structural bug this task fixes: module-scope parsing means the value is computed once at import time and never updates on client-side navigation between two different class IDs, which is exactly the kind of bug React Router migration must eliminate)
- Modify: `frontend/src/pages/AdminClassPage.test.tsx`

**Interfaces:** component becomes `AdminClassPage()` still with no props (route is `/admin/classes/:id`), but internally calls `const { id } = useParams<{ id: string }>()` and uses `Number(id)` computed per-render.

- [ ] **Step 1: Read current file + test**

```bash
cat frontend/src/pages/AdminClassPage.tsx
cat frontend/src/pages/AdminClassPage.test.tsx
```

- [ ] **Step 2: Rewrite the test**, now wrapping with `renderWithProviders(<AdminClassPage />, { route: "/admin/classes/42" })` and asserting the page fetches/displays data for class 42 (via a mocked `getClass`/`listClassStudents` etc. call assertion), plus a new test confirming navigating from `/admin/classes/42` to `/admin/classes/43` (re-render with new route) fetches class 43's data — this is the regression test for the module-scope-parsing bug being fixed.

- [ ] **Step 3: Run to verify it fails**

```bash
cd frontend && npx vitest run src/pages/AdminClassPage.test.tsx
```

- [ ] **Step 4: Re-skin + fix param handling** — replace the module-scope `const classId = Number(location.pathname.split("/").pop())` with `const { id } = useParams<{ id: string }>(); const classId = Number(id);` computed inside the component body; re-skin remaining markup onto primitives; add `BackButton` usage update if it currently does `location.assign` navigation that should become `useNavigate()`-based (check `BackButton.tsx` from Task 1's baseline — it currently falls back to `location.assign(fallbackHref)`, which still works under React Router since it's a full navigation fallback only used when there's no history; leave as-is unless it visibly breaks in manual testing).

- [ ] **Step 5: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/AdminClassPage.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AdminClassPage.tsx frontend/src/pages/AdminClassPage.test.tsx
git commit -m "fix: read classId via useParams instead of module-scope path parsing, rebuild on Tailwind"
```

---

## Task 21: Rebuild `TeacherClassesPage`

**Files:**
- Modify: `frontend/src/pages/TeacherClassesPage.tsx`
- Modify: `frontend/src/pages/TeacherClassesPage.test.tsx` (check exact filename first)

- [ ] **Step 1: Read current file + test**

```bash
cat frontend/src/pages/TeacherClassesPage.tsx
ls frontend/src/pages/TeacherClassesPage*.test.tsx
```

- [ ] **Step 2: Rewrite test(s)** with `@testing-library/react` + `renderWithProviders`, preserving current behavioral coverage.

- [ ] **Step 3: Run to verify failure**

```bash
cd frontend && npx vitest run src/pages/TeacherClassesPage.test.tsx
```

- [ ] **Step 4: Re-skin** onto `Card`/`Table`/`EmptyState`/`Spinner`, converting `<a href>` class links to `<Link>`.

- [ ] **Step 5: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/TeacherClassesPage.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/TeacherClassesPage.tsx frontend/src/pages/TeacherClassesPage.test.tsx
git commit -m "feat: rebuild TeacherClassesPage on Tailwind, migrate test to testing-library"
```

---

## Task 22: Rebuild `TeacherClassPage` with `useParams()`

**Files:**
- Modify: `frontend/src/pages/TeacherClassPage.tsx` (currently `classId()` is a **function**, re-evaluated per call via `location.pathname.split("/").pop()` — this task replaces it with `useParams()`, and preserves the existing exported helpers `normalizeTeacherClassTab(tab: string | null): Tab`, `toLocalDateTime(value)`, `toUtcIso(value)` unchanged, since other files/tests may import them)
- Modify: `frontend/src/pages/TeacherClassPage.tsx` test files — three exist per investigation: `TeacherClassPage.links.test.tsx`, `TeacherClassPage.roster.test.tsx`, `TeacherClassPage.destructive.test.tsx` — migrate all three.

- [ ] **Step 1: Read current file and all three test files**

```bash
cat frontend/src/pages/TeacherClassPage.tsx
cat frontend/src/pages/TeacherClassPage.links.test.tsx frontend/src/pages/TeacherClassPage.roster.test.tsx frontend/src/pages/TeacherClassPage.destructive.test.tsx
```

- [ ] **Step 2: Rewrite all three test files** with `@testing-library/react` + `renderWithProviders(<TeacherClassPage />, { route: "/teacher/classes/7" })`, preserving each file's specific test intent (`links` = nav/tab links, `roster` = student roster CRUD, `destructive` = remove-student/delete confirmations — likely via `AppDialog`).

- [ ] **Step 3: Run to verify failure**

```bash
cd frontend && npx vitest run src/pages/TeacherClassPage.links.test.tsx src/pages/TeacherClassPage.roster.test.tsx src/pages/TeacherClassPage.destructive.test.tsx
```

- [ ] **Step 4: Re-skin + fix param handling** — replace the `classId()` function with `const { id } = useParams<{ id: string }>();` and `Number(id)` read once per render at the top of the component (not re-invoked as a function throughout — audit all current call sites of `classId()` in the file and replace each with the new `classId` variable); tabs (`normalizeTeacherClassTab`) likely currently driven by a query param or path segment — if driven by `location.search`, migrate to `useSearchParams()`; re-skin tab UI, roster table, and any `AppDialog` usage onto primitives.

- [ ] **Step 5: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/TeacherClassPage.links.test.tsx src/pages/TeacherClassPage.roster.test.tsx src/pages/TeacherClassPage.destructive.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/TeacherClassPage.tsx frontend/src/pages/TeacherClassPage.links.test.tsx frontend/src/pages/TeacherClassPage.roster.test.tsx frontend/src/pages/TeacherClassPage.destructive.test.tsx
git commit -m "fix: read classId via useParams in TeacherClassPage, rebuild on Tailwind"
```

---

## Task 23: Rebuild `TeacherGradebookPage` with `useParams()`

**Files:**
- Modify: `frontend/src/pages/TeacherGradebookPage.tsx` (currently `classId()` function reads `location.pathname.split("/")[3]` — same fix pattern as Task 22)
- Modify: `frontend/src/pages/TeacherGradebookPage.test.tsx`

- [ ] **Step 1: Read current file + test**

```bash
cat frontend/src/pages/TeacherGradebookPage.tsx
cat frontend/src/pages/TeacherGradebookPage.test.tsx
```

- [ ] **Step 2: Rewrite test** with `renderWithProviders(<TeacherGradebookPage />, { route: "/teacher/classes/7/gradebook" })`.

- [ ] **Step 3: Run to verify failure**

```bash
cd frontend && npx vitest run src/pages/TeacherGradebookPage.test.tsx
```

- [ ] **Step 4: Re-skin + fix param handling** — `const { id } = useParams<{ id: string }>();`, keep `downloadClassGradebook(id, filename)` call and gradebook table logic (`gradebook-table*` CSS classes in `styles.css` referenced by investigation — replace with `Table` primitive + Tailwind, keeping the same cell structure/data).

- [ ] **Step 5: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/TeacherGradebookPage.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/TeacherGradebookPage.tsx frontend/src/pages/TeacherGradebookPage.test.tsx
git commit -m "fix: read classId via useParams in TeacherGradebookPage, rebuild on Tailwind"
```

---

## Task 24: Rebuild `AssignmentPage` (shared teacher/student), route wiring cleanup

**Files:**
- Modify: `frontend/src/pages/AssignmentPage.tsx` (currently `AssignmentPage({ assignmentId, role })` receiving both as props from `main.tsx`'s regex parse — `role` is now a route-level prop passed by `main.tsx`'s two separate `<Route>` entries per Task 7, `assignmentId` becomes `useParams()`)
- Modify: `frontend/src/main.tsx` — update the two `AssignmentPage` route elements from `<AssignmentPage role="TEACHER" />` (which doesn't yet pass `assignmentId`) to read it via `useParams()` inside the component instead of as a prop
- Modify: `frontend/src/pages/AssignmentPage.test.tsx`

**Interfaces:** new signature `AssignmentPage({ role }: { role: Extract<Role, "TEACHER"|"STUDENT"> })`, `assignmentId` read internally via `useParams<{ assignmentId: string }>()`.

- [ ] **Step 1: Read current file + test**

```bash
cat frontend/src/pages/AssignmentPage.tsx
cat frontend/src/pages/AssignmentPage.test.tsx
```

- [ ] **Step 2: Rewrite test** with two `renderWithProviders` cases: `role="TEACHER"` at route `/teacher/assignments/9`, `role="STUDENT"` at route `/student/assignments/9`, both asserting assignment data loads for id 9.

- [ ] **Step 3: Run to verify failure**

```bash
cd frontend && npx vitest run src/pages/AssignmentPage.test.tsx
```

- [ ] **Step 4: Update signature and re-skin** — drop `assignmentId` from props, add `const { assignmentId } = useParams<{ assignmentId: string }>();` inside, `Number(assignmentId)` used wherever the prop was used before; re-skin submission list/rubric/detail markup onto primitives, keeping role-conditional rendering (teacher sees grade links, student sees submit form) untouched in logic.

- [ ] **Step 5: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/AssignmentPage.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AssignmentPage.tsx frontend/src/pages/AssignmentPage.test.tsx frontend/src/main.tsx
git commit -m "fix: read assignmentId via useParams in AssignmentPage, rebuild on Tailwind"
```

---

## Task 25: Rebuild `GradePage` with `useParams()`

**Files:**
- Modify: `frontend/src/pages/GradePage.tsx` (currently `GradePage({ assignmentId, submissionId })` as props — both become `useParams()`)
- Modify: `frontend/src/pages/GradePage.test.tsx`

- [ ] **Step 1: Read current file + test**

```bash
cat frontend/src/pages/GradePage.tsx
cat frontend/src/pages/GradePage.test.tsx
```

- [ ] **Step 2: Rewrite test** with `renderWithProviders(<GradePage />, { route: "/teacher/assignments/9/submissions/3/grade" })`.

- [ ] **Step 3: Run to verify failure**

```bash
cd frontend && npx vitest run src/pages/GradePage.test.tsx
```

- [ ] **Step 4: Update signature to `GradePage()` (no props)**, read `const { assignmentId, submissionId } = useParams<{ assignmentId: string; submissionId: string }>();`, `Number(...)` both; re-skin rubric/grade-entry form onto primitives with `noValidate` + `validate()` for the score input(s) per Global Constraints.

- [ ] **Step 5: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/GradePage.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/GradePage.tsx frontend/src/pages/GradePage.test.tsx
git commit -m "fix: read params via useParams in GradePage, rebuild on Tailwind with inline validation"
```

---

## Task 26: Rebuild `StudentClassesPage`

**Files:**
- Modify: `frontend/src/pages/StudentClassesPage.tsx`
- Modify: `frontend/src/pages/StudentClassesPage.test.tsx`

- [ ] **Step 1: Read current file + test**

```bash
cat frontend/src/pages/StudentClassesPage.tsx
cat frontend/src/pages/StudentClassesPage.test.tsx
```

- [ ] **Step 2: Rewrite test** with `@testing-library/react` + `renderWithProviders`.

- [ ] **Step 3: Run to verify failure**

```bash
cd frontend && npx vitest run src/pages/StudentClassesPage.test.tsx
```

- [ ] **Step 4: Re-skin** onto `Card`/`Table`/`EmptyState`, `<a href>` → `<Link>`.

- [ ] **Step 5: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/StudentClassesPage.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/StudentClassesPage.tsx frontend/src/pages/StudentClassesPage.test.tsx
git commit -m "feat: rebuild StudentClassesPage on Tailwind, migrate test to testing-library"
```

---

## Task 27: Rebuild `StudentClassPage` with `useParams()`

**Files:**
- Modify: `frontend/src/pages/StudentClassPage.tsx` (same module-scope `classId` parsing bug as `AdminClassPage`, same fix)
- Modify: `frontend/src/pages/StudentClassPage.test.tsx`

- [ ] **Step 1: Read current file + test**

```bash
cat frontend/src/pages/StudentClassPage.tsx
cat frontend/src/pages/StudentClassPage.test.tsx
```

- [ ] **Step 2: Rewrite test** with `renderWithProviders(<StudentClassPage />, { route: "/student/classes/7" })`, plus a route-change regression test like Task 20's.

- [ ] **Step 3: Run to verify failure**

```bash
cd frontend && npx vitest run src/pages/StudentClassPage.test.tsx
```

- [ ] **Step 4: Fix param handling + re-skin** — same pattern as Task 20.

- [ ] **Step 5: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/StudentClassPage.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/StudentClassPage.tsx frontend/src/pages/StudentClassPage.test.tsx
git commit -m "fix: read classId via useParams in StudentClassPage, rebuild on Tailwind"
```

---

## Task 28: Rebuild `ResultPage` with `useParams()`

**Files:**
- Modify: `frontend/src/pages/ResultPage.tsx` (currently `ResultPage({ assignmentId })` as prop)
- Modify: `frontend/src/pages/ResultPage.test.tsx`

- [ ] **Step 1: Read current file + test**

```bash
cat frontend/src/pages/ResultPage.tsx
cat frontend/src/pages/ResultPage.test.tsx
```

- [ ] **Step 2: Rewrite test** with `renderWithProviders(<ResultPage />, { route: "/student/assignments/9/result" })`.

- [ ] **Step 3: Run to verify failure**

```bash
cd frontend && npx vitest run src/pages/ResultPage.test.tsx
```

- [ ] **Step 4: Update signature to `ResultPage()` (no props)**, `const { assignmentId } = useParams<{ assignmentId: string }>();`; re-skin result/rubric display onto primitives.

- [ ] **Step 5: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/ResultPage.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ResultPage.tsx frontend/src/pages/ResultPage.test.tsx
git commit -m "fix: read assignmentId via useParams in ResultPage, rebuild on Tailwind"
```

---

## Task 29: Rebuild `ProfilePage`

**Files:**
- Modify: `frontend/src/pages/ProfilePage.tsx`
- Modify: `frontend/src/pages/ProfilePage.test.tsx`

**Interfaces:** consumes `useAuth()` instead of a `user` prop if it currently receives one; `updateProfile(draft: ProfileDraft)` from `auth.tsx` unchanged.

- [ ] **Step 1: Read current file + test**

```bash
cat frontend/src/pages/ProfilePage.tsx
cat frontend/src/pages/ProfilePage.test.tsx
```

- [ ] **Step 2: Rewrite test** with `renderWithProviders`, following Task 9's pattern for the edit-profile form (controlled fields, `validate()`, error preserves input).

- [ ] **Step 3: Run to verify failure**

```bash
cd frontend && npx vitest run src/pages/ProfilePage.test.tsx
```

- [ ] **Step 4: Re-skin** onto `Field`/`Card`/`Button`/`Alert`, `noValidate` + `validate(draft: ProfileDraft)` checking whatever fields currently have native `required`/`pattern` attrs (phone format, etc. — read Step 1's output for exact current rules), call `updateProfile` then `useAuth().refresh()` to update context after save.

- [ ] **Step 5: Run to verify it passes**

```bash
cd frontend && npx vitest run src/pages/ProfilePage.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ProfilePage.tsx frontend/src/pages/ProfilePage.test.tsx
git commit -m "feat: rebuild ProfilePage on Tailwind with controlled inline validation"
```

---

## Task 30: Delete dead code — `styles.css`, unused `session.ts` helpers

**Files:**
- Delete: `frontend/src/styles.css`
- Modify: `frontend/src/main.tsx` (remove `import "./styles.css";`)
- Modify: `frontend/index.html` (remove Fira Sans is still needed — keep font links; nothing else to remove here, already done in Task 2)
- Modify: `frontend/src/session.ts` (remove `canAccess()` — no longer called anywhere now that `RequireRole` replaces it; keep `roleHome`, `startSession`, `accessToken`, `clearSession`, `redirectToLogin`, `Role` type)

- [ ] **Step 1: Confirm no page still references Bootstrap classes or `styles.css` rules**

```bash
grep -rln "className=\".*\(btn-\|card\b\|nav-pills\|d-flex\|d-md-none\|workspace-\|account-\|teacher-tabs\|gradebook-table\|rubric-row\)" frontend/src/pages frontend/src/*.tsx frontend/src/components
```

Expected: no matches (every page was migrated in Tasks 8–29). If matches remain, that page's task was incomplete — go back and finish it before proceeding.

- [ ] **Step 2: Confirm `canAccess` has no remaining callers**

```bash
grep -rn "canAccess" frontend/src
```

Expected: zero matches outside `session.ts` itself.

- [ ] **Step 3: Delete `styles.css`, remove its import, remove `canAccess` from `session.ts`**

```bash
git rm frontend/src/styles.css
```

Edit `frontend/src/main.tsx` to remove the `import "./styles.css";` line. Edit `frontend/src/session.ts` to delete the `canAccess` function and its regex constants.

- [ ] **Step 4: Verify**

```bash
cd frontend && npx tsc --noEmit && npm run build && npm test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/main.tsx frontend/src/session.ts
git commit -m "chore: remove Bootstrap-era styles.css and unused canAccess()"
```

---

## Task 31: Full-suite verification checkpoint

**Files:** none — verification only.

- [ ] **Step 1: Typecheck, build, test**

```bash
cd frontend && npx tsc --noEmit && npm run build && npm test
```

Expected: all PASS, zero Bootstrap/`styles.css` references remain, every page test uses `@testing-library/react`.

- [ ] **Step 2: Manual smoke test of every route in the spec's route list**, logged in as each of ADMIN/TEACHER/STUDENT: `/dashboard`, `/profile`, role-specific pages, `/change-password`, log out, `/login`, `/forgot-password`, an invalid URL (404), confirm no full-page reloads occur on nav-link clicks (check Network tab / no flash).

```bash
cd frontend && npm run dev
```

No commit — gate only. This closes out the frontend half of the rebuild; Tasks 32–38 below implement the backend password-reset contract the frontend already assumes (`ResetPasswordPage` from Task 11 and `AdminUsersPage`'s modal from Task 16 currently call endpoints that don't exist yet on the backend).

---

## Task 32: Backend — `PasswordResetToken` model + migration

**Files:**
- Modify: `backend/accounts/models.py` (add `PasswordResetToken`)
- Create: `backend/accounts/migrations/0006_password_reset_token.py`
- Test: `backend/accounts/tests/test_password_reset_token.py`

**Interfaces:**
- Produces:
  ```python
  class PasswordResetToken(models.Model):
      user: ForeignKey[User]
      token: CharField  # opaque random string, unique, indexed
      created_at: DateTimeField  # auto_now_add
      expires_at: DateTimeField
      used_at: DateTimeField | None
      @classmethod
      def issue(cls, user: User) -> "PasswordResetToken": ...
      def is_valid(self) -> bool: ...  # not used and not expired
  ```

- [ ] **Step 1: Write the failing test**

`backend/accounts/tests/test_password_reset_token.py`:

```python
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from accounts.models import User, PasswordResetToken


class PasswordResetTokenTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="student@example.com", password="oldpass123", role=User.Role.STUDENT)

    def test_issue_creates_unique_unexpired_token(self):
        token = PasswordResetToken.issue(self.user)
        self.assertTrue(token.token)
        self.assertTrue(token.is_valid())
        self.assertIsNone(token.used_at)

    def test_is_valid_false_when_expired(self):
        token = PasswordResetToken.issue(self.user)
        token.expires_at = timezone.now() - timedelta(seconds=1)
        token.save(update_fields=["expires_at"])
        self.assertFalse(token.is_valid())

    def test_is_valid_false_when_used(self):
        token = PasswordResetToken.issue(self.user)
        token.used_at = timezone.now()
        token.save(update_fields=["used_at"])
        self.assertFalse(token.is_valid())
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend && python manage.py test accounts.tests.test_password_reset_token
```

Expected: FAIL — `PasswordResetToken` doesn't exist.

- [ ] **Step 3: Add the model** to `backend/accounts/models.py` (append near `PasswordResetRequest`):

```python
import secrets

class PasswordResetToken(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="password_reset_tokens")
    token = models.CharField(max_length=64, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    TTL_MINUTES = 30

    @classmethod
    def issue(cls, user: "User") -> "PasswordResetToken":
        return cls.objects.create(
            user=user,
            token=secrets.token_urlsafe(32),
            expires_at=timezone.now() + timedelta(minutes=cls.TTL_MINUTES),
        )

    def is_valid(self) -> bool:
        return self.used_at is None and self.expires_at > timezone.now()
```

Add `from django.utils import timezone` and `from datetime import timedelta` to the top of `models.py` if not already imported (check first).

- [ ] **Step 4: Generate and review the migration**

```bash
cd backend && python manage.py makemigrations accounts --name password_reset_token
```

Confirm it's written as `accounts/migrations/0006_password_reset_token.py` with `dependencies = [("accounts", "0005_password_reset_request")]`.

- [ ] **Step 5: Run to verify it passes**

```bash
cd backend && python manage.py test accounts.tests.test_password_reset_token
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/accounts/models.py backend/accounts/migrations/0006_password_reset_token.py backend/accounts/tests/test_password_reset_token.py
git commit -m "feat(backend): add PasswordResetToken model"
```

---

## Task 33: Backend — email-sending utility

**Files:**
- Modify: `backend/config/settings.py` (add `EMAIL_BACKEND` + related settings, env-driven)
- Create: `backend/accounts/mail.py`
- Test: `backend/accounts/tests/test_mail.py`

**Interfaces:**
- Produces: `def send_password_reset_email(user: User, token: PasswordResetToken) -> None` — sends an email with a link to `{FRONTEND_BASE_URL}/reset-password?token={token.token}`.

- [ ] **Step 1: Write the failing test** (Django's test runner auto-swaps `EMAIL_BACKEND` to `locmem` during tests — no real SMTP needed)

`backend/accounts/tests/test_mail.py`:

```python
from django.test import TestCase, override_settings
from django.core import mail
from accounts.models import User, PasswordResetToken
from accounts.mail import send_password_reset_email


@override_settings(FRONTEND_BASE_URL="https://app.example.com")
class SendPasswordResetEmailTests(TestCase):
    def test_sends_email_with_reset_link_containing_token(self):
        user = User.objects.create_user(email="student@example.com", password="oldpass123", role=User.Role.STUDENT)
        token = PasswordResetToken.issue(user)

        send_password_reset_email(user, token)

        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertEqual(sent.to, ["student@example.com"])
        self.assertIn(f"https://app.example.com/reset-password?token={token.token}", sent.body)
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend && python manage.py test accounts.tests.test_mail
```

Expected: FAIL — `accounts.mail` doesn't exist.

- [ ] **Step 3: Add settings**

In `backend/config/settings.py`, add (near other env-driven settings — check the file's existing pattern for reading env vars first, e.g. `os.environ.get` or `django-environ`, and match it):

```python
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "http://localhost:5173")
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "true").lower() == "true"
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "no-reply@example.com")
```

Default backend is `console` (prints to stdout) so local/dev works with zero config; production sets real `EMAIL_HOST`/credentials via env vars.

- [ ] **Step 4: Implement `accounts/mail.py`**

```python
from django.conf import settings
from django.core.mail import send_mail
from .models import User, PasswordResetToken


def send_password_reset_email(user: User, token: PasswordResetToken) -> None:
    link = f"{settings.FRONTEND_BASE_URL}/reset-password?token={token.token}"
    send_mail(
        subject="Đặt lại mật khẩu",
        message=(
            f"Bạn đã yêu cầu đặt lại mật khẩu. Nhấn vào liên kết sau để đặt mật khẩu mới "
            f"(hết hạn sau {PasswordResetToken.TTL_MINUTES} phút):\n\n{link}\n\n"
            "Nếu bạn không yêu cầu điều này, hãy bỏ qua email này."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
    )
```

- [ ] **Step 5: Run to verify it passes**

```bash
cd backend && python manage.py test accounts.tests.test_mail
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/config/settings.py backend/accounts/mail.py backend/accounts/tests/test_mail.py
git commit -m "feat(backend): add password-reset email sending utility"
```

---

## Task 34: Backend — `POST /password-reset-requests` (redesigned to send email)

**Files:**
- Modify: `backend/accounts/views.py` (rewrite `PasswordResetRequestView.post`; remove its `get` method)
- Modify: `backend/accounts/urls.py` (no path change — same URL, only handler behavior changes; `GET` method disappears since `PasswordResetRequestView` no longer defines `get`)
- Modify: `backend/accounts/tests/test_accounts.py` (replace `test_password_reset_request_is_private_and_deduplicated` — dedup no longer applies since every request issues a fresh token; keep the no-enumeration assertion)

**Interfaces:**
- `POST /api/password-reset-requests` `{ email }` → `204` always. If an active user with that email exists, issues a `PasswordResetToken` and sends the email; otherwise does nothing — response is identical either way, matching the frontend contract in `requestPasswordReset()` (unchanged, per spec).

- [ ] **Step 1: Read current `PasswordResetRequestView` and its test in full**

```bash
grep -n "class PasswordResetRequestView" -A 30 backend/accounts/views.py
sed -n '370,420p' backend/accounts/tests/test_accounts.py
```

- [ ] **Step 2: Write the failing test**, replacing the old dedup test:

```python
def test_password_reset_request_sends_email_for_existing_active_user(self):
    User.objects.create_user(email="student@example.com", password="oldpass123", role=User.Role.STUDENT)
    response = self.client.post("/api/password-reset-requests", {"email": "student@example.com"}, format="json")
    self.assertEqual(response.status_code, 204)
    self.assertEqual(len(mail.outbox), 1)
    self.assertEqual(mail.outbox[0].to, ["student@example.com"])

def test_password_reset_request_is_silent_for_unknown_email(self):
    response = self.client.post("/api/password-reset-requests", {"email": "nobody@example.com"}, format="json")
    self.assertEqual(response.status_code, 204)
    self.assertEqual(len(mail.outbox), 0)

def test_password_reset_request_rejects_get(self):
    response = self.client.get("/api/password-reset-requests")
    self.assertEqual(response.status_code, 405)
```

Add `from django.core import mail` to the test file's imports if not present.

- [ ] **Step 3: Run to verify it fails**

```bash
cd backend && python manage.py test accounts.tests.test_accounts.AccountsTests.test_password_reset_request_sends_email_for_existing_active_user
```

(Adjust the test class name to whatever it actually is in the file, found in Step 1.)

- [ ] **Step 4: Rewrite `PasswordResetRequestView`**

```python
class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        user = User.objects.filter(
            email=email, is_active=True, role__in=(User.Role.TEACHER, User.Role.STUDENT)
        ).first()
        if user is not None:
            token = PasswordResetToken.issue(user)
            send_password_reset_email(user, token)
        return Response(status=status.HTTP_204_NO_CONTENT)
```

Remove the old `get` method entirely. Add imports: `from .models import PasswordResetToken` and `from .mail import send_password_reset_email` at the top of `views.py`.

- [ ] **Step 5: Run to verify it passes**

```bash
cd backend && python manage.py test accounts.tests.test_accounts
```

Expected: PASS (all tests in the file, including the two new ones and the `405` case).

- [ ] **Step 6: Commit**

```bash
git add backend/accounts/views.py backend/accounts/tests/test_accounts.py
git commit -m "feat(backend): send password-reset email instead of queuing admin request"
```

---

## Task 35: Backend — `POST /password-reset/:token`

**Files:**
- Modify: `backend/accounts/views.py` (add `PasswordResetConfirmView`)
- Modify: `backend/accounts/urls.py` (add route)
- Modify: `backend/accounts/serializers.py` (add `PasswordResetConfirmSerializer`, reusing `PasswordResetResolveSerializer`'s password validation rules — min 8 chars)
- Test: append to `backend/accounts/tests/test_accounts.py`

**Interfaces:**
- `POST /api/password-reset/<token>` `{ password }` → `204` on success; `404` with `{ "detail": "..." }` if no such token exists; `410` with `{ "detail": "..." }` if the token exists but is expired or already used — matches the frontend contract `resetPassword(token, password)` from Task 11.

- [ ] **Step 1: Write the failing tests**

```python
def test_password_reset_confirm_sets_new_password_and_marks_token_used(self):
    user = User.objects.create_user(email="student@example.com", password="oldpass123", role=User.Role.STUDENT)
    token = PasswordResetToken.issue(user)

    response = self.client.post(f"/api/password-reset/{token.token}", {"password": "brandnewpass1"}, format="json")

    self.assertEqual(response.status_code, 204)
    user.refresh_from_db()
    self.assertTrue(user.check_password("brandnewpass1"))
    token.refresh_from_db()
    self.assertIsNotNone(token.used_at)

def test_password_reset_confirm_404_for_unknown_token(self):
    response = self.client.post("/api/password-reset/does-not-exist", {"password": "brandnewpass1"}, format="json")
    self.assertEqual(response.status_code, 404)

def test_password_reset_confirm_410_for_expired_token(self):
    user = User.objects.create_user(email="student2@example.com", password="oldpass123", role=User.Role.STUDENT)
    token = PasswordResetToken.issue(user)
    token.expires_at = timezone.now() - timedelta(seconds=1)
    token.save(update_fields=["expires_at"])

    response = self.client.post(f"/api/password-reset/{token.token}", {"password": "brandnewpass1"}, format="json")
    self.assertEqual(response.status_code, 410)

def test_password_reset_confirm_410_for_already_used_token(self):
    user = User.objects.create_user(email="student3@example.com", password="oldpass123", role=User.Role.STUDENT)
    token = PasswordResetToken.issue(user)
    self.client.post(f"/api/password-reset/{token.token}", {"password": "firstchange1"}, format="json")

    response = self.client.post(f"/api/password-reset/{token.token}", {"password": "secondchange1"}, format="json")
    self.assertEqual(response.status_code, 410)
```

Ensure `from django.utils import timezone` and `from datetime import timedelta` are imported in the test file.

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend && python manage.py test accounts.tests.test_accounts
```

Expected: FAIL — route `/api/password-reset/<token>` doesn't exist (404 for a different reason — no matching URL).

- [ ] **Step 3: Add the serializer**

In `backend/accounts/serializers.py`, add:

```python
class PasswordResetConfirmSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False, min_length=8, max_length=128)
```

- [ ] **Step 4: Add the view**

In `backend/accounts/views.py`:

```python
class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, token):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            reset_token = PasswordResetToken.objects.select_related("user").get(token=token)
        except PasswordResetToken.DoesNotExist:
            return Response({"detail": "Liên kết không hợp lệ."}, status=status.HTTP_404_NOT_FOUND)

        if not reset_token.is_valid():
            return Response({"detail": "Liên kết đã hết hạn hoặc đã được sử dụng."}, status=status.HTTP_410_GONE)

        with transaction.atomic():
            user = reset_token.user
            user.set_password(serializer.validated_data["password"])
            user.must_change_password = False
            user.save(update_fields=("password", "must_change_password"))
            reset_token.used_at = timezone.now()
            reset_token.save(update_fields=("used_at",))
            write_audit(actor=user, action="account.password_reset", target=user, metadata={})

        return Response(status=status.HTTP_204_NO_CONTENT)
```

(Confirm `write_audit`'s exact import path/signature by checking how `PasswordResetResolveView` calls it, and match it exactly.)

- [ ] **Step 5: Add the route**

In `backend/accounts/urls.py`, add near the other password-reset paths:

```python
path("password-reset/<str:token>", PasswordResetConfirmView.as_view()),
```

- [ ] **Step 6: Run to verify it passes**

```bash
cd backend && python manage.py test accounts.tests.test_accounts
```

Expected: PASS (4 new tests + existing suite).

- [ ] **Step 7: Commit**

```bash
git add backend/accounts/views.py backend/accounts/urls.py backend/accounts/serializers.py backend/accounts/tests/test_accounts.py
git commit -m "feat(backend): add POST /password-reset/:token confirm endpoint"
```

---

## Task 36: Backend — `POST /users/:id/reset-password` (admin-direct)

**Files:**
- Modify: `backend/accounts/views.py` (add `AdminResetPasswordView`)
- Modify: `backend/accounts/urls.py` (add route)
- Modify: `backend/accounts/serializers.py` (reuse `PasswordResetResolveSerializer`, or rename/alias it for clarity — reuse it as-is to avoid an unnecessary duplicate class per Global Constraints' spirit of small diffs)
- Test: append to `backend/accounts/tests/test_accounts.py`

**Interfaces:**
- `POST /api/users/<id>/reset-password` `{ password }` → `200` with the updated `User` (matches `resetUserPassword(id, password): Promise<User>` from Task 16), admin-only (`IsAdmin`).

- [ ] **Step 1: Write the failing tests**

```python
def test_admin_can_reset_user_password_directly(self):
    admin = User.objects.create_superuser(email="admin@example.com", password="adminpass1")
    target = User.objects.create_user(email="student4@example.com", password="oldpass123", role=User.Role.STUDENT)
    self.client.force_authenticate(admin)

    response = self.client.post(f"/api/users/{target.id}/reset-password", {"password": "adminsetpass1"}, format="json")

    self.assertEqual(response.status_code, 200)
    self.assertEqual(response.data["email"], "student4@example.com")
    target.refresh_from_db()
    self.assertTrue(target.check_password("adminsetpass1"))
    self.assertTrue(target.must_change_password)

def test_non_admin_cannot_reset_user_password(self):
    teacher = User.objects.create_user(email="teacher1@example.com", password="teacherpass1", role=User.Role.TEACHER)
    target = User.objects.create_user(email="student5@example.com", password="oldpass123", role=User.Role.STUDENT)
    self.client.force_authenticate(teacher)

    response = self.client.post(f"/api/users/{target.id}/reset-password", {"password": "hackedpass1"}, format="json")

    self.assertEqual(response.status_code, 403)
```

(Match `force_authenticate` / whatever auth helper the existing tests already use — check `test_accounts.py` for the established pattern, e.g. it may use JWT tokens via `self.client.credentials(...)` instead; use whatever convention is already there.)

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend && python manage.py test accounts.tests.test_accounts
```

Expected: FAIL — route doesn't exist.

- [ ] **Step 3: Add the view**, reusing `PasswordResetResolveSerializer` (already validates `password`, min 8 chars) — read `backend/accounts/serializers.py` to confirm its exact name before using it:

```python
class AdminResetPasswordView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, user_id):
        target = get_object_or_404(User, pk=user_id, is_active=True, role__in=(User.Role.TEACHER, User.Role.STUDENT))
        serializer = PasswordResetResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target.set_password(serializer.validated_data["password"])
        target.must_change_password = True
        target.save(update_fields=("password", "must_change_password"))
        write_audit(actor=request.user, action="account.password_reset_by_admin", target=target, metadata={})

        return Response(UserSerializer(target).data, status=status.HTTP_200_OK)
```

Add `from django.shortcuts import get_object_or_404` if not already imported.

- [ ] **Step 4: Add the route**

```python
path("users/<int:user_id>/reset-password", AdminResetPasswordView.as_view()),
```

- [ ] **Step 5: Run to verify it passes**

```bash
cd backend && python manage.py test accounts.tests.test_accounts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/accounts/views.py backend/accounts/urls.py backend/accounts/tests/test_accounts.py
git commit -m "feat(backend): add admin-direct POST /users/:id/reset-password endpoint"
```

---

## Task 37: Backend — remove old admin-queue endpoints and model

**Files:**
- Modify: `backend/accounts/views.py` (delete `PasswordResetResolveView`, delete now-empty imports)
- Modify: `backend/accounts/urls.py` (remove `password-reset-requests/<int:request_id>/resolve` path)
- Modify: `backend/accounts/serializers.py` (delete `PasswordResetResolveSerializer` — **do not** delete it if Task 36 aliased/reused it; if Task 36 reused it as-is, keep it and rename its class docstring/usage to reflect its new sole purpose, since deleting it would break Task 36)
- Create: `backend/accounts/migrations/0007_remove_password_reset_request.py` (drop the `PasswordResetRequest` model/table)
- Modify: `backend/accounts/models.py` (remove `PasswordResetRequest` class)
- Modify: `backend/accounts/tests/test_accounts.py` (remove `test_admin_resolves_pending_reset_once_and_forces_password_change` and any other test referencing `PasswordResetRequest`/`PasswordResetResolveView`'s resolve endpoint — Task 36 already covers the admin-direct-reset behavior that replaces it)

- [ ] **Step 1: Confirm what still references `PasswordResetRequest`/`PasswordResetResolveView`**

```bash
grep -rn "PasswordResetRequest\b\|PasswordResetResolveView" backend/accounts
```

- [ ] **Step 2: Remove the resolve route and view**

Delete the `path("password-reset-requests/<int:request_id>/resolve", ...)` line from `backend/accounts/urls.py` and the `PasswordResetResolveView` class from `backend/accounts/views.py`.

- [ ] **Step 3: Remove the old tests**

Delete `test_admin_resolves_pending_reset_once_and_forces_password_change` from `backend/accounts/tests/test_accounts.py` (its behavior is superseded by Task 36's `test_admin_can_reset_user_password_directly`).

- [ ] **Step 4: Remove the model and generate the drop migration**

Delete the `PasswordResetRequest` class from `backend/accounts/models.py`.

```bash
cd backend && python manage.py makemigrations accounts --name remove_password_reset_request
```

Confirm it's `0007_remove_password_reset_request.py` with `dependencies = [("accounts", "0006_password_reset_token")]` and contains a `migrations.DeleteModel(name="PasswordResetRequest")` operation.

- [ ] **Step 5: Run full backend test suite**

```bash
cd backend && python manage.py test
```

Expected: PASS, no references to the removed model/view remain anywhere.

- [ ] **Step 6: Commit**

```bash
git add backend/accounts/views.py backend/accounts/urls.py backend/accounts/models.py backend/accounts/migrations/0007_remove_password_reset_request.py backend/accounts/tests/test_accounts.py
git commit -m "chore(backend): remove admin-approval-queue password reset model and endpoints"
```

---

## Task 38: End-to-end verification

**Files:** none — verification only.

- [ ] **Step 1: Run full backend suite**

```bash
cd backend && python manage.py test
```

- [ ] **Step 2: Run full frontend suite**

```bash
cd frontend && npx tsc --noEmit && npm run build && npm test
```

- [ ] **Step 3: Manual end-to-end smoke test** with both servers running (`python manage.py runserver` + `npm run dev`): request a password reset for a real seeded account, confirm the console-backend email prints the `/reset-password?token=...` link, follow it, set a new password, confirm redirect to `/login` with a success notice, log in with the new password. Then, as ADMIN, open `/admin/users`, click the reset-password icon on a row, set a password, confirm it saves and the modal closes.

No commit — final gate confirming the whole spec (frontend rebuild + backend password-reset contract) works end-to-end.
