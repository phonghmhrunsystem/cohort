# Frontend UI Rebuild — Design

## Goal

Replace the entire frontend UI of the class-management LMS with a new visual
design and SPA navigation. Most existing backend contracts are unchanged;
the password-reset flow is redesigned and needs new backend endpoints — the
UI is built first against a defined contract (below), backend implements to
match.

## Scope

Full re-skin + re-architecture of `frontend/`:

- Tailwind CSS replaces Bootstrap 5 (CDN link + `styles.css` removed).
- React Router (client-side SPA) replaces the current full-reload routing in
  `main.tsx`.
- All existing pages get new markup/styling built on a small shared UI
  primitive set. Functional behavior (what data is shown, what actions are
  available, error handling) is preserved unless called out below.
- Three additions: a role-aware **Dashboard** home page, a **404** page, and
  a self-service **forgot/reset password** flow (see below).
- **Password reset redesigned**: self-service via emailed link replaces the
  admin-approval-queue model. `/admin/password-reset-requests` is removed.
  Admin keeps the ability to set a user's password directly, moved into a
  per-row action on `/admin/users`.
- **Client-side validation redesigned**: native browser validation
  (`required`, `pattern`, `minLength` tooltips) is replaced everywhere with
  JS validation that renders error messages inline, consistent with how
  server-side field errors already render.
- Test suite rewritten with `@testing-library/react` (new devDependency;
  `jsdom` is already present).

Out of scope: dark mode, calendar view, global search.

## Routes

```
/login
/forgot-password        (new — request a reset email)
/reset-password          (new — set new password, ?token=... from email, no login required)
/change-password
/dashboard               (new — role home, replaces roleHome() target)
/profile
/admin/users             (per-row action: reset password modal)
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

`roleHome()` now returns `/dashboard` for every role. `/admin/password-reset-requests`
is removed — no route, no nav link.

## Flow

```
/login ─ submit ──────────────► must_change_password? ─yes─► /change-password ─► /dashboard
        └─ "Forgot password?" ─► /forgot-password ─ submit email ─► "check your email" notice

email link ─► /reset-password?token=... ─ submit new password ─► /login (success notice)

/admin/users ─ click reset-password icon on a row ─► modal: set new password ─► saved, modal closes

/dashboard (role-aware cards: my classes + progress, upcoming deadlines,
            unread notifications) ─► role nav (sidebar) ─► existing per-role pages
```

## Password reset — API contract (new backend work)

The UI is built against this contract; backend implements to match.

- `POST /password-reset-requests` `{ email }` → `204`. Behavior changes from
  "queue a request for Admin" to "if the account exists, email it a
  time-limited reset link containing a token". Response is unchanged
  (always `204`, no account enumeration) so `requestPasswordReset()` in
  `auth.ts` is reused as-is.
- `POST /password-reset/:token` `{ password }` → `204` on success; `404`/`410`
  with `{ detail }` if the token is invalid or expired. New function
  `resetPassword(token, password)` added to `auth.ts`.
- `POST /users/:id/reset-password` `{ password }` → returns the updated
  `User`, admin-only. New function `resetUserPassword(id, password)` added
  to `classes.ts` (alongside the other admin user-management calls).
- Removed: `GET /password-reset-requests`, `POST /password-reset-requests/:id/resolve`.

## Client-side validation

Every form drops native HTML validation attributes that trigger browser
tooltips (`required`, `pattern`, `minLength` as a *blocking* mechanism) in
favor of explicit JS checks run on submit:

- `<form noValidate>` everywhere.
- Each page defines a small `validate(draft) → Record<field, string>` and
  runs it before calling the API. On failure, set the same field-error state
  already used for server-side `ApiFailure.fields`, so both sources render
  through the one `Field` error slot — no separate error UI path.
- Native attributes that aid input *type/affordance* (`type="email"`,
  `type="date"`, `maxLength` as a hard character cap) are kept; only the
  ones that currently pop a blocking tooltip on submit are replaced.

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
  an icon for the 404 page. The existing `KeyIcon` (currently used for the
  removed admin nav link) is reused for the per-row reset-password action on
  `/admin/users`.
- **Data layer**: `assignments.ts`, `grading.ts`, `notifications.ts`
  unchanged. `auth.ts` gains `resetPassword(token, password)`; `classes.ts`
  gains `resetUserPassword(id, password)` (see contract above). Dashboard
  reuses `listClasses()` (already returns `progress`: graded/total/nearest
  deadline) and `listNotifications()`; no new endpoints needed for it.

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
4. Auth pages: Login, ForgotPassword, ResetPassword, ChangePassword.
5. New Dashboard + 404.
6. Admin pages (Users incl. reset-password modal, AuditLog, Classes, ClassDetail).
7. Teacher pages (Classes, ClassDetail, Gradebook, Assignment, Grade).
8. Student pages (Classes, ClassDetail, Assignment, Result) + shared
   Profile.
9. Delete dead code (`styles.css` Bootstrap-era rules, old routing helpers
   in `session.ts` no longer used).
