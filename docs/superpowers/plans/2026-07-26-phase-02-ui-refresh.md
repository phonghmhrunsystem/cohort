# Phase 2 UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 1 unstyled admin screens with a responsive Bootstrap workspace while keeping every existing route, API call, and interaction intact.

**Architecture:** Load Bootstrap CSS from its CDN and apply its utilities/components directly in the three existing page components. Keep the shared admin shell markup in the two admin pages: the spec limits changes to those pages and the stylesheet, so a new component would be needless scope.

**Tech Stack:** React 19, TypeScript, Vite 7, Bootstrap 5 CDN CSS, Vitest 4.

## Global Constraints

- Change only `frontend/index.html`, the three page components, and `frontend/src/styles.css`.
- Load Bootstrap 5 CSS from a CDN; do not install an npm dependency.
- Preserve `/`, `/admin/users`, `/admin/audit-logs`, API contracts/calls, authentication behavior, and backend code.
- Use Bootstrap utilities/components plus the small application stylesheet only for the shared workspace and responsive navigation.
- Preserve the existing labels, field validation, loading states, alerts, and screen-reader text.

---

## File Structure

- Modify: `frontend/index.html` â€” add Bootstrap CDN stylesheet.
- Modify: `frontend/src/styles.css` â€” replace Phase 1 styling with the shared shell and narrow-screen navigation.
- Modify: `frontend/src/pages/LoginPage.tsx` â€” centered card, keeping submit behavior.
- Modify: `frontend/src/pages/AdminUsersPage.tsx` â€” workspace, form card, responsive table, and badges, keeping all API functions.
- Modify: `frontend/src/pages/AuditLogPage.tsx` â€” same workspace and responsive audit table, keeping its effect/API call.

### Task 1: Add Bootstrap and the workspace shell

**Files:**
- Modify: `frontend/index.html:1`
- Modify: `frontend/src/styles.css:1-5`

**Interfaces:**
- Consumes: Bootstrap CDN class names used in every page.
- Produces: `.workspace`, `.workspace-sidebar`, `.workspace-content`, and `.workspace-nav`.

- [ ] **Step 1: Load Bootstrap CSS before the existing Vite module**

```html
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet">
<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
```

- [ ] **Step 2: Replace Phase 1 global rules with the minimal responsive shell**

```css
body { min-width: 320px; background: #f4f7fb; }
.workspace { display: flex; min-height: 100vh; }
.workspace-sidebar { width: 15rem; flex: 0 0 15rem; background: #102a43; }
.workspace-content { min-width: 0; flex: 1; }
.workspace-nav a { color: #d9e2ec; }
.workspace-nav a[aria-current="page"] { background: #243b53; color: #fff; }
@media (max-width: 767.98px) {
  .workspace { display: block; }
  .workspace-sidebar { width: auto; }
  .workspace-nav { display: flex; overflow-x: auto; }
}
```

Retain `.sr-only`. Add only small sidebar-link hover/focus, spacing, and table/card refinements; Bootstrap owns component styling.

- [ ] **Step 3: Run the production check**

Run: `npm run build` (working directory: `frontend`)

Expected: TypeScript and Vite both exit successfully.

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html frontend/src/styles.css
git commit -m "style: add Bootstrap workspace foundation"
```

### Task 2: Refresh the login screen

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx:5-26`

**Interfaces:**
- Consumes: Bootstrap CDN styles.
- Produces: the same `/` sign-in flow, with unchanged `login(email, password)` and `/admin/users` redirect.

- [ ] **Step 1: Replace only LoginPage's returned JSX with a centered card**

```tsx
return <main className="min-vh-100 d-flex align-items-center bg-body-tertiary py-4">
  <section className="card shadow-sm border-0 mx-auto w-100" style={{ maxWidth: "28rem" }}>
    <div className="card-body p-4 p-md-5">
      <p className="text-primary fw-semibold mb-2">Class Management</p>
      <h1 className="h3 mb-4">Sign in</h1>
      <form onSubmit={submit} aria-busy={loading} className="d-grid gap-3">
        <label className="form-label mb-0">Email<input className="form-control mt-1" name="email" type="email" autoComplete="email" required /></label>
        <label className="form-label mb-0">Password<input className="form-control mt-1" name="password" type="password" autoComplete="current-password" required /></label>
        <button className="btn btn-primary w-100" disabled={loading}>{loading ? "Signing inâ€¦" : "Sign in"}</button>
        {error && <p className="alert alert-danger mb-0" role="alert">{error}</p>}
      </form>
    </div>
  </section>
</main>;
```

Leave `submit` unchanged. Give labels `form-label`, inputs `form-control`, the button `btn btn-primary w-100`, and the existing error `alert alert-danger` with `role="alert"`. Retain the exact disabled/loading text.

- [ ] **Step 2: Run automated checks**

Run: `npm test; npm run build` (working directory: `frontend`)

Expected: all Vitest tests pass and the build exits 0.

- [ ] **Step 3: Check login layouts manually**

At desktop and 375px widths, verify the card is centered and readable. Submit invalid credentials to verify the alert, then submit once while pending to verify the disabled `Signing inâ€¦` state.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx
git commit -m "style: refresh login screen"
```

### Task 3: Refresh the accounts workspace

**Files:**
- Modify: `frontend/src/pages/AdminUsersPage.tsx:25-39`

**Interfaces:**
- Consumes: shell classes from Task 1, and existing `load`, `create`, `update`, and state.
- Produces: accounts form/table UI while keeping POST and PATCH behaviors unchanged.

- [ ] **Step 1: Replace only the returned JSX with the admin workspace**

```tsx
return <div className="workspace">
  <aside className="workspace-sidebar p-3">
    <a className="text-white text-decoration-none fw-semibold d-block mb-4" href="/admin/users">Class Management</a>
    <nav className="workspace-nav nav nav-pills flex-column gap-1" aria-label="Admin navigation">
      <a className="nav-link" href="/admin/users" aria-current="page">Accounts</a>
      <a className="nav-link" href="/admin/audit-logs">Audit log</a>
    </nav>
  </aside>
  <main className="workspace-content p-3 p-lg-4">
    <div className="d-flex justify-content-between align-items-center mb-4"><div><h1 className="h2 mb-1">Accounts</h1><p className="text-secondary mb-0">Manage administrator, teacher, and student accounts.</p></div></div>
    <section className="card shadow-sm border-0 mb-4"><div className="card-body">Create-account form</div></section>
    <section className="card shadow-sm border-0">Account results</section>
  </main>
</div>;
```

Use an `h1` named Accounts and the description â€œManage administrator, teacher, and student accounts.â€ Put the existing form in a `card shadow-sm`, arrange its existing inputs in Bootstrap grid columns, and preserve every name, validation constraint, default value, and submit handler.

- [ ] **Step 2: Wrap the existing rows in a responsive Bootstrap table**

```tsx
<div className="table-responsive"><table className="table table-hover align-middle mb-0">
  <thead className="table-light"><tr><th>Email</th><th>Role</th><th>Active</th></tr></thead>
  <tbody>{users.map((user) => <tr key={user.id}>
    <td><label><span className="sr-only">Email for {user.email}</span><input className="form-control" value={user.email} onChange={(event) => setUsers((current) => current.map((entry) => entry.id === user.id ? { ...entry, email: event.target.value } : entry))} onBlur={() => update(user, { email: users.find((entry) => entry.id === user.id)?.email })} /></label></td>
    <td><label><span className="sr-only">Role for {user.email}</span><select className="form-select" value={user.role} onChange={(event) => void update(user, { role: event.target.value as Role })}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label></td>
    <td><span className={`badge text-bg-\${user.role === "ADMIN" ? "primary" : user.role === "TEACHER" ? "info" : "secondary"}`}>{user.role}</span></td>
    <td><span className={`badge text-bg-\${user.is_active ? "success" : "secondary"}`}>{user.is_active ? "Active" : "Inactive"}</span>{/* existing checkbox */}</td>
  </tr>)}</tbody>
</table></div>
```

Keep the current visually hidden labels and `onBlur`/ `onChange` callbacks. Use Bootstrap alert/empty-state containers for loading, error, and empty messages; retain `role="alert"` on errors.

- [ ] **Step 3: Run automated checks**

Run: `npm test; npm run build` (working directory: `frontend`)

Expected: all tests pass and build exits 0.

- [ ] **Step 4: Check accounts manually**

At desktop, verify fixed navy sidebar, active Accounts link, card, badges, editable email/role, and checkbox. At 375px, verify horizontal navigation, stacked form, and scrollable table. Change each editable field once to confirm the existing PATCH calls still run.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AdminUsersPage.tsx
git commit -m "style: refresh accounts workspace"
```

### Task 4: Refresh the audit-log workspace

**Files:**
- Modify: `frontend/src/pages/AuditLogPage.tsx:18-20`

**Interfaces:**
- Consumes: shell classes from Task 1 and existing logs/loading/error state.
- Produces: an audit-log UI that retains the same auth check, endpoint, values, and formatting.

- [ ] **Step 1: Replace only the returned JSX with the shared workspace**

```tsx
return <div className="workspace">
  <aside className="workspace-sidebar p-3">
    <a className="text-white text-decoration-none fw-semibold d-block mb-4" href="/admin/users">Class Management</a>
    <nav className="workspace-nav nav nav-pills flex-column gap-1" aria-label="Admin navigation">
      <a className="nav-link" href="/admin/users">Accounts</a>
      <a className="nav-link" href="/admin/audit-logs" aria-current="page">Audit log</a>
    </nav>
  </aside>
  <main className="workspace-content p-3 p-lg-4"><h1 className="h2 mb-4">Audit log</h1><section className="card shadow-sm border-0">Audit-log results</section></main>
</div>;
```

Do not alter the `useEffect`, authorization check, request endpoint, timestamp formatting, metadata serialization, or error message.

- [ ] **Step 2: Use a responsive card/table for the current five audit columns**

```tsx
<div className="card shadow-sm border-0"><div className="table-responsive">
  <table className="table table-hover align-middle mb-0">
    <thead className="table-light"><tr><th>When</th><th>Action</th><th>Actor</th><th>Target</th><th>Details</th></tr></thead>
    <tbody>{logs.map((log) => <tr key={log.id}>
      <td>{new Date(log.created_at).toLocaleString()}</td><td><span className="badge text-bg-secondary">{log.action}</span></td><td>{log.actor_id ?? "System"}</td><td>{log.target_type} #{log.target_id}</td><td><code className="small text-break">{JSON.stringify(log.metadata)}</code></td>
    </tr>)}</tbody>
  </table>
</div></div>
```

Render action as a neutral badge and metadata as `<code className="small text-break">{JSON.stringify(log.metadata)}</code>`. Preserve all five current fields and values.

- [ ] **Step 3: Run automated checks**

Run: `npm test; npm run build` (working directory: `frontend`)

Expected: all tests pass and Vite builds successfully.

- [ ] **Step 4: Check audit logs manually**

At desktop, verify fixed sidebar, active Audit log link, readable timestamps, badge, and metadata. At 375px, verify horizontal navigation and that every table column is reachable by table scrolling, without page-level horizontal overflow.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AuditLogPage.tsx
git commit -m "style: refresh audit-log workspace"
```

## Final Verification

- [ ] Run `npm test; npm run build` from `frontend`; expect all tests and the build to pass.
- [ ] Start `npm run dev`, then inspect `/`, `/admin/users`, and `/admin/audit-logs` at desktop and 375px widths.
- [ ] Confirm only the five specified frontend files changed. Leave the existing untracked `.playwright-mcp/` directory untouched.

