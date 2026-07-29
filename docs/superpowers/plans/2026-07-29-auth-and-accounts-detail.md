# Auth & Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace the reset-request queue with emailed single-use recovery, make Teacher/Student account lifecycle manageable, and build the matching React experience.

**Architecture:** Django accounts owns lifecycle, recovery, authorization, and audit decisions through shared helpers. React owns only access-token state, guarded routes, and controlled forms against the API.

**Tech Stack:** Django, DRF, SimpleJWT, Django email/cache, React 19, Vite, TypeScript, React Router, Tailwind CSS, Vitest/jsdom.

## Global Constraints

- API paths are relative to /api; use 401 unauthenticated, 403 unauthorized, 404 absent/out of scope, and 422 validation/business failure.
- No registration, queue alias, restore, refresh token, SMTP integration, component library, or dashboard-only API.
- Normalize written email; email and role are immutable. Audit metadata has no strings, passwords, hashes, tokens, URLs, secrets, or arbitrary text.
- Active Class means is_active true and ends_at later than now. Disabled/deleted users cannot teach or enroll.
- Store only access token in sessionStorage; forms use noValidate and persistent inline errors, never validation tooltips.

---

## File map

- backend/accounts models, services, mail, throttling, serializers, permissions, views and urls: account contract.
- backend/accounts migrations 0006_auth_lifecycle and 0007_remove_password_reset_request: additive migration then legacy deletion.
- backend/classes models, serializers, views and migration 0003_class_is_active: lifecycle dependency.
- backend/config/settings.py: stable JWT key, email, cache, URL, validators.
- backend/accounts tests test_accounts and test_recovery: security/API coverage.
- frontend/src: typed API/auth provider, primitives/shell, pages, Vitest tests.

### Task 1: Add lifecycle schema and stable settings

**Files:**
- Modify: backend/accounts/models.py, backend/classes/models.py, backend/config/settings.py
- Create: backend/accounts/migrations/0006_auth_lifecycle.py, backend/classes/migrations/0003_class_is_active.py
- Test: backend/accounts/tests/test_accounts.py, backend/classes/tests/test_classes.py

**Produces:** User hometown, is_deleted, created_at, updated_at; PasswordResetToken; Class is_active; stable JWT signing.

- [ ] **Step 1: Write failing tests.** Assert lifecycle defaults, Class active default, token table fields, and an environment signing key remains stable after settings reload.

~~~python
@override_settings(DJANGO_SECRET_KEY="stable-test-key")
def test_jwt_key_is_stable(self):
    self.assertEqual(settings.SIMPLE_JWT["SIGNING_KEY"], "stable-test-key")
~~~

- [ ] **Step 2: Run focused tests.**

~~~powershell
cd backend; python manage.py test accounts.tests.test_accounts classes.tests.test_classes
~~~

- [ ] **Step 3: Implement schema/settings.** Add indexed User deletion/create/update fields, nullable 100-char hometown, and PasswordResetToken with user FK, unique SHA-256 hash, created, indexed expiry, and nullable used timestamp. Add Class active boolean default true. Use DJANGO_SECRET_KEY or development SECRET_KEY for SimpleJWT; configure Django standard password validators, console email, FRONTEND_URL default, default sender, and local-memory cache.

- [ ] **Step 4: Hand-write migrations.** Account 0006 depends on 0005 and does not alter PasswordResetRequest; Class 0003 depends on 0002.

- [ ] **Step 5: Migrate, test, commit.**

~~~powershell
cd backend; python manage.py migrate; python manage.py test accounts.tests.test_accounts classes.tests.test_classes
git add backend/accounts backend/classes backend/config/settings.py
git commit -m "feat(accounts): add account lifecycle and reset-token schema"
~~~

### Task 2: Centralize lifecycle and recovery services

**Files:**
- Create: backend/accounts/services.py, mail.py, throttling.py, tests/test_recovery.py
- Modify: backend/accounts/models.py

**Consumes:** Task 1 schema.
**Produces:** manageable_users(), has_active_class(user), issue_reset_token(user), consume_reset_token(raw,new,confirm), send_password_reset_email(user,raw).

- [ ] **Step 1: Write failing service tests.** Cover SHA-256-only storage, 32-byte url-safe raw token, invalidated previous tokens, one email reset link, expiry/used/unknown results, and exactly one winner in sequential reset consumption.

~~~python
raw = issue_reset_token(self.student)
self.assertFalse(PasswordResetToken.objects.filter(token_hash=raw).exists())
self.assertEqual(consume_reset_token(raw, "Password123!", "Password123!"), "ok")
self.assertEqual(consume_reset_token(raw, "Another123!", "Another123!"), "used")
~~~

- [ ] **Step 2: Implement minimal helpers.** manageable_users filters non-deleted Teacher/Student. has_active_class checks ownership/enrollment with active and future predicates. Issue uses secrets token_urlsafe(32), SHA-256, transaction atomic and select_for_update to mark prior usable tokens used. Consume locks by hash, rechecks expiry/used, validates password, writes password plus used time atomically, and audits account.password_changed with empty metadata.

- [ ] **Step 3: Add delivery/limits.** Send mail on transaction commit using FRONTEND_URL reset-password query token. Use Django cache keys based on normalized email and REMOTE_ADDR: 1/minute/email, 5/hour/IP. A denied request returns 204 and sends no email.

- [ ] **Step 4: Test and commit.**

~~~powershell
cd backend; python manage.py test accounts.tests.test_recovery
git add backend/accounts
git commit -m "feat(accounts): add transactional password recovery service"
~~~

### Task 3: Replace auth/profile API and enforce forced-user access

**Files:**
- Modify: backend/accounts serializers, permissions, views, urls, tests/test_accounts.py, tests/test_recovery.py

**Consumes:** Task 2.
**Produces:** recovery endpoints, hardened login, confirm-new-password validation, shared IsAdmin permission.

- [ ] **Step 1: Write failing API tests.** Test inactive/deleted login 401; hometown visible but deletion hidden; forced users only me/change-password/logout; all eligible/ineligible forgot requests 204; preflight reset 204/404/410; mismatch returns 422 field errors.

- [ ] **Step 2: Implement serializers/views/routes.** Add hometown fields; reject identity/status/deletion/password in self PATCH. Password serializers accept new_password and confirm_new_password, reject extras, compare, and call Django password validators. Add POST auth/forgot-password, GET auth/reset-password/token, POST auth/reset-password. Login rejects deleted accounts. Move IsAdmin to permissions.py and apply it to every users route; retain exact forced allowlist.

- [ ] **Step 3: Test and commit.**

~~~powershell
cd backend; python manage.py test accounts.tests.test_accounts accounts.tests.test_recovery
git add backend/accounts
git commit -m "feat(accounts): add secure recovery API"
~~~

### Task 4: Implement Admin account lifecycle API

**Files:**
- Modify: backend/accounts serializers, views, urls, tests/test_accounts.py
- Modify: backend/classes serializers, views, tests/test_classes.py

**Consumes:** Tasks 2-3.
**Produces:** paginated users list, detail GET/PATCH, status PATCH, direct reset, irreversible delete.

- [ ] **Step 1: Write failing tests.** Cover 10/page count-next-previous-results sorted updated descending then id; query/role/inclusive date filters; disabled visible/editable/re-enable; deleted/Admin 404; create forces password change; GET detail; status/reset/delete audits; active Class blocks but ended/disabled Class allows.

~~~python
response = self.admin_client.patch(f"/api/users/{user.id}/status", {"is_active": False}, format="json")
self.assertEqual(response.status_code, 422)
self.assertIn("active Class", response.data["detail"])
~~~

- [ ] **Step 2: Implement one manageable queryset and focused views.** Use PageNumberPagination page size 10 and validate date pairs as 422 field errors. Detail gets/patches same queryset. Status guard applies only true-to-false and audits deactivated/reactivated. Direct reset atomically writes password plus must-change-password and audits password_set. Delete atomically sets deleted and inactive and audits deleted; no restore route.

- [ ] **Step 3: Restrict audit metadata and Class boundaries.** Metadata contains only safe IDs, role and booleans. Teacher selection, enrollment candidates and roster querysets require non-deleted users.

- [ ] **Step 4: Test and commit.**

~~~powershell
cd backend; python manage.py test accounts.tests.test_accounts audit.tests.test_audit classes.tests.test_classes
git add backend/accounts backend/classes
git commit -m "feat(accounts): complete account lifecycle API"
~~~

### Task 5: Delete legacy queue after replacement works

**Files:**
- Modify: backend/accounts models, serializers, views, urls, tests/test_accounts.py
- Create: backend/accounts/migrations/0007_remove_password_reset_request.py

- [ ] **Step 1: Replace queue tests with recovery/direct reset tests and add a no-reference regression.**

~~~python
def test_legacy_queue_has_no_runtime_reference(self):
    files = Path(settings.BASE_DIR / "accounts").glob("**/*.py")
    self.assertFalse(any("PasswordResetRequest" in file.read_text() for file in files))
~~~

- [ ] **Step 2: Delete model, constraint import, serializers, views, routes, tests, queue page and Admin nav link.** Do not retain aliases or migrate pending rows.

- [ ] **Step 3: Add migration 0007 depending on 0006, containing only DeleteModel PasswordResetRequest.**

- [ ] **Step 4: Verify and commit.**

~~~powershell
rg -n 'PasswordResetRequest|password-reset-requests|Reset requests' backend frontend
cd backend; python manage.py migrate; python manage.py test accounts.tests
git add backend/accounts frontend
git commit -m "chore(accounts): remove password reset queue"
~~~

Expected: ripgrep has no matches; migrations/tests pass.

## UI Design Skill Gate (required before Tasks 6-10)

Use the local `ui-ux-pro-max` skill, sourced from [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), before writing any frontend UI. Save the generated design-system output and the chosen decisions in `docs/superpowers/designs/2026-07-29-auth-and-accounts-ui.md`; implementation may use only the selected semantic tokens, spacing scale, typography, component states, and responsive rules.

Run the required design-system query first:

~~~powershell
python .agents/skills/ui-ux-pro-max/scripts/search.py "Vietnamese class-management SaaS admin accounts authentication responsive accessible calm professional" --design-system -p "Class Management Auth & Accounts" -f markdown
python .agents/skills/ui-ux-pro-max/scripts/search.py "forms validation dialogs navigation responsive accessibility" --domain ux -n 12
python .agents/skills/ui-ux-pro-max/scripts/search.py "account management tables filters status actions" --stack react
~~~

Use these prompts verbatim at the indicated tasks. Do not add a design-system package, icon package, dark mode, or animation library unless the prompt's selected solution cannot be expressed by Tailwind/CSS and an explicit requirement is added.

**Task 6 prompt — foundation and design tokens**

> Use the `ui-ux-pro-max` skill to create a desktop-first, responsive design system for a Vietnamese class-management SaaS. Product areas are public authentication, forced password change, profile, and Admin account management. Output: one visual direction; semantic light-theme color tokens; typography pair and scale; 4px/8px spacing scale; border, radius, elevation, z-index, focus, error, success, and disabled tokens; desktop/tablet/mobile breakpoints. The product must feel calm and professional, use a dark-indigo navigation area with a light content canvas, meet WCAG AA contrast, use no emoji as structural icons, and avoid dark mode, glassmorphism, gradients, and decorative motion. Prefer CSS/Tailwind tokens over new dependencies.

**Task 7 prompt — shell and shared components**

> Use the selected `ui-ux-pro-max` design system to specify the responsive app shell and shared primitives for React/Tailwind. Cover desktop role sidebar, topbar user/logout menu, mobile topbar/drawer, and Button, Card, Badge, Field, Table, EmptyState, Spinner, Alert, Dialog. For every component define visual states, keyboard behavior, ARIA requirements, minimum 44px touch targets, visible focus, error placement, loading feedback, and 320px/768px/1024px layout behavior. Use native dialog and CSS where possible; no component library.

**Task 8 prompt — authentication flows**

> Use the selected `ui-ux-pro-max` tokens to design Login, Forgot Password, Reset Password, and Change Password as compact public/protected cards. Specify field order, helper/error copy placement, password visibility control, submit loading/success/failure states, token-invalid/expired recovery state, and keyboard focus order. Forms must use visible labels, inline persistent errors, semantic input/autocomplete attributes, no browser validation bubble, no tooltip-only feedback, and must retain user input after a 422 response.

**Task 9 prompt — Accounts and Profile**

> Use the selected `ui-ux-pro-max` tokens to design an Admin Accounts workspace and Profile pages. Specify hierarchy for filters, table, pagination, status badge, action menu, create/set-password dialogs, view/edit pages, and destructive confirmations. On mobile, prioritize search/status/actions while keeping the table usable without clipping; use an accessible menu rather than disappearing actions. Include distinct loading, empty, failure, disabled, active-Class-blocked, and deleted-account states. Profile must clearly distinguish editable profile fields from immutable identity/role information.

### Task 6: Establish React foundation

**Files:**
- Modify: frontend package.json, vite.config.ts, tsconfig.json
- Create: frontend/src main.tsx, App.tsx, styles.css, types.ts, test/setup.ts, lib/api.ts, lib/errors.ts, lib/api.test.ts

**Produces:** selected design decisions documented in `docs/superpowers/designs/2026-07-29-auth-and-accounts-ui.md`, typed fetch client, and test-ready Vite app.

- [ ] **Step 1: Run the UI Design Skill Gate and commit the design decision document.** Apply the Task 6 prompt, record the actual palette/font/token choices and rejected alternatives, then use those choices in `styles.css` CSS variables/Tailwind theme. Do not begin component markup before this document exists.

- [ ] **Step 2: Write failing API test.** Mock fetch; assert bearer header, 204 undefined result, and 422 becomes typed status plus fields.

- [ ] **Step 3: Add only required packages.**

~~~powershell
cd frontend; npm install react-router-dom; npm install -D tailwindcss @tailwindcss/vite @testing-library/react @testing-library/user-event
~~~

- [ ] **Step 4: Implement client/types and tokens.** request parses JSON only if present and never persists tokens. Define User, Page, field-error and contract payload types. Use URLSearchParams for filters; configure Tailwind Vite plugin, one CSS import, and only the design-gate semantic variables.

- [ ] **Step 5: Test and commit.**

~~~powershell
cd frontend; npm test -- api.test.ts; npm run build
git add frontend
git commit -m "feat(frontend): add typed account API foundation"
~~~

### Task 7: Add auth state, route guards, primitives, and shell

**Files:**
- Create: frontend/src/auth AuthProvider, RequireAuth, RequireRole; components Button, Card, Badge, Field, Table, EmptyState, Spinner, Alert, Dialog, AppShell; pages DashboardPage, NotFoundPage
- Modify: frontend/src App.tsx, styles.css
- Test: frontend/src/auth/AuthProvider.test.tsx, frontend/src/App.test.tsx

- [ ] **Step 1: Write tests.** Assert startup me call once with session token, one 401 clear/redirect, anonymous login redirect, wrong role dashboard, forced change-password-only route, accessible names for icon controls.

- [ ] **Step 2: Implement auth/routes.** useAuth exposes user, loading, refresh, login, logout; only sessionStorage access token persists. Add public login/forgot/reset, forced change-password, protected dashboard/profile/admin/Class placeholders, and NotFound. roleHome is dashboard.

- [ ] **Step 3: Implement accessible shell.** Fields have label and persistent role-alert error. Native dialog restores focus. Mobile drawer has backdrop, Escape, body lock, and labels. Desktop is dark-indigo sidebar/light canvas; tables horizontally scroll.

- [ ] **Step 4: Test and commit.**

~~~powershell
cd frontend; npm test -- AuthProvider.test.tsx App.test.tsx; npm run build
git add frontend/src
git commit -m "feat(frontend): add guarded responsive shell"
~~~

### Task 8: Implement auth screens

**Files:**
- Create: frontend/src/pages LoginPage, ForgotPasswordPage, ResetPasswordPage, ChangePasswordPage
- Modify: frontend/src/App.tsx
- Test: frontend/src/pages/auth-pages.test.tsx

- [ ] **Step 1: Write tests.** Login routes forced account to change password; forgot always shows generic notice; missing/404/410 reset links forgot; mismatch/server 422 is inline; validation DOM has neither title nor tooltip role.

- [ ] **Step 2: Implement controlled noValidate forms.** Login includes reveal button/alert and refresh. Forgot posts email then generic notice. Reset preflights then submits token/new/confirm and returns login notice. Change posts current/new/confirm, refreshes, opens dashboard. Keep drafts on 422.

- [ ] **Step 3: Test and commit.**

~~~powershell
cd frontend; npm test -- auth-pages.test.tsx; npm run build
git add frontend/src
git commit -m "feat(frontend): add authentication pages"
~~~

### Task 9: Implement Admin Accounts and Profile

**Files:**
- Create: frontend/src/pages AdminUsersPage, AdminUserViewPage, AdminUserEditPage, ProfilePage, ProfileEditPage; components AccountForm, AccountActions
- Modify: frontend/src/App.tsx
- Test: frontend/src/pages AdminUsersPage.test.tsx, ProfilePage.test.tsx

- [ ] **Step 1: Write tests.** Search-only fetch and preserved filters; disabled shows/deleted hides; create/reset dialogs retain 422 drafts; accessible menu exposes actions; confirmation displays active-Class error; profile omits immutable fields.

- [ ] **Step 2: Implement Accounts.** Separate draft/submitted filters, fetch only search/page, render loading/failure/empty/table states, use Create/Set-password dialogs and View/Edit pages, immutable email/role, destructive confirmations. Refresh list after mutation without clearing submitted filters.

- [ ] **Step 3: Implement Profile.** Identity card shows allowed data with Edit/Change password. Edit PATCHes profile-only data and refreshes auth.

- [ ] **Step 4: Test and commit.**

~~~powershell
cd frontend; npm test -- AdminUsersPage.test.tsx ProfilePage.test.tsx; npm run build
git add frontend/src
git commit -m "feat(frontend): add accounts and profile workflows"
~~~

### Task 10: Connect navigation and acceptance checks

**Files:**
- Modify: frontend/src App.tsx, components/AppShell.tsx, pages/DashboardPage.tsx
- Test: frontend/src/App.test.tsx

- [ ] **Step 1: Wire role navigation.** Admin: Dashboard, Accounts, Classes, Audit. Teacher/Student: Dashboard, My Classes, Profile, notifications. Use existing Class routes/API; do not add dashboard endpoint.

- [ ] **Step 2: Run all automation.**

~~~powershell
cd backend; python manage.py test
cd ..\frontend; npm test; npm run build
~~~

- [ ] **Step 3: Manual acceptance.** Keyboard/mobile test auth, profile, Accounts, one Class page at 320px/desktop: focus restoration, Escape/backdrop drawer close, visible focus, no validation tooltip, disabled re-enable, deleted 404, active-Class 422, and single-use reset.

- [ ] **Step 4: Commit.**

~~~powershell
git add frontend
git commit -m "feat(frontend): connect account navigation"
~~~

## Plan self-review

- Tasks 1-5 cover persistence, recovery, APIs, permissions, audit, lifecycle, and legacy removal.
- Tasks 6-10 cover tooling, routes, shell, forms, Accounts/Profile, navigation, and verification.
- Skipped: queue alias, SMTP client, refresh tokens, component library, and dashboard API. Add only with a concrete requirement.
