# Frontend UI Rebuild — Design

## Goal

Replace the entire frontend UI of the class-management LMS with a new visual
design and SPA navigation, while keeping the existing backend contracts
unchanged. No backend changes are required by this project.

## Scope

Full re-skin + re-architecture of `frontend/`:

- Tailwind CSS replaces Bootstrap 5 (CDN link + `styles.css` removed).
- React Router (client-side SPA) replaces the current full-reload routing in
  `main.tsx`.
- All 17 existing pages get new markup/styling built on a small shared UI
  primitive set. Functional behavior (what data is shown, what actions are
  available, validation, error handling) is preserved unless called out
  below.
- Two additions: a role-aware **Dashboard** home page, and a **404** page.
- Test suite rewritten with `@testing-library/react` (new devDependency;
  `jsdom` is already present).

Out of scope: any backend/API change, dark mode, calendar view, global
search, self-service (token-based) password reset — admin-approval reset
flow is kept as-is.

## Routes

```
/login
/forgot-password        (new — split out of LoginPage's inline toggle)
/change-password
/dashboard               (new — role home, replaces roleHome() target)
/profile
/admin/users
/admin/password-reset-requests
/admin/audit-logs
/admin/classes
/admin/classes/:id
/teacher/classes
/teacher/classes/:id
/teacher/classes/:id/gradebook
/teacher/assignments/:id
/teacher/assignments/:id/submissions/:id/grade
/student/classes
/student/classes/:id
/student/assignments/:id
/student/assignments/:id/result
*                         (new — 404)
```

`roleHome()` now returns `/dashboard` for every role. `/forgot-password` is
reached via a "Forgot password?" link on `/login`; it calls the existing
`requestPasswordReset` and shows the same "request sent to an Admin" notice.
The admin approval page (`/admin/password-reset-requests`) is kept, just
restyled.

## Flow

```
/login ─ submit ──────────────► must_change_password? ─yes─► /change-password ─► /dashboard
        └─ "Forgot password?" ─► /forgot-password ─ submit ─► notice, back to /login

/dashboard (role-aware cards: my classes + progress, upcoming deadlines,
            unread notifications) ─► role nav (sidebar) ─► existing per-role pages
```

## Architecture

- **Routing**: `react-router-dom`, `<BrowserRouter>` with a flat route table
  in `main.tsx` mirroring the list above. Each protected route is wrapped in
  a `<RequireRole roles={[...]}>` guard element instead of the current
  regex-based `canAccess()` check in `session.ts` — same allow-list, just
  expressed per-route instead of one big regex.
- **Auth state**: new `AuthContext` (`src/auth-context.tsx`) fetches
  `getCurrentUser()` once at app root and exposes `{ user, loading, refresh }`.
  Replaces the current pattern of `main.tsx` fetching the user and passing it
  as a prop into `AppShell`. Pages that need `user` (Profile, AppShell) read
  it from context instead of props. This avoids a redundant `/auth/me` call
  on every navigation now that navigation doesn't reload the page.
- **Styling**: Tailwind CSS (`tailwindcss`, `postcss`, `autoprefixer` as
  devDependencies), config with a small custom palette + the existing Fira
  Sans font. Bootstrap CDN `<link>` and `styles.css` removed once migration
  is complete.
- **UI primitives** (`src/components/ui/`): `Button`, `Card`, `Badge`,
  `Field` (label+input+error), `Table`, `EmptyState`, `Spinner`, `Alert`.
  Built once, reused across all pages — kept intentionally small, no
  component library dependency (no shadcn/Radix) since Tailwind alone covers
  this app's needs.
- **Modal**: `AppDialog` keeps its existing `<dialog>` + focus-restore logic
  (that part is markup-agnostic), only its Tailwind classes change.
- **Icons**: keep `components/icons.tsx`, add `HomeIcon` (dashboard nav) and
  an icon for the 404 page.
- **Data layer**: `api.ts`, `auth.ts`, `classes.ts`, `assignments.ts`,
  `grading.ts`, `notifications.ts` are unchanged — same functions, same
  endpoints. Dashboard reuses `listClasses()` (already returns `progress`:
  graded/total/nearest deadline) and `listNotifications()`; no new endpoints.

## Error handling

Unchanged pattern: catch `ApiFailure`, show `detail` (and per-field errors
where present) in a styled `Alert` component. 401 still redirects to
`/login` via `redirectToLogin()` inside `api.ts`.

## Testing

Each rewritten page gets a `@testing-library/react` test using
`render()` + a small test helper that wraps the tree in `MemoryRouter` and a
mock `AuthContext.Provider`. Tests query by role/label/text (resilient to
markup changes) instead of mocking hook call order. Test *intent* (what
behavior each existing test verifies) is preserved; the harness mechanics
are not.

## Suggested build order (informs the implementation plan)

1. Tooling: add Tailwind + React Router + `@testing-library/react`, base
   Tailwind config, remove Bootstrap.
2. UI primitives + icons.
3. `AuthContext`, `RequireRole`, new `main.tsx` route table, rebuilt
   `AppShell`.
4. Auth pages: Login, ForgotPassword, ChangePassword.
5. New Dashboard + 404.
6. Admin pages (Users, PasswordResetRequests, AuditLog, Classes, ClassDetail).
7. Teacher pages (Classes, ClassDetail, Gradebook, Assignment, Grade).
8. Student pages (Classes, ClassDetail, Assignment, Result) + shared
   Profile.
9. Delete dead code (`styles.css` Bootstrap-era rules, old routing helpers
   in `session.ts` no longer used).
