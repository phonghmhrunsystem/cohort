# Clear UX and Safe Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiển thị danh tính rõ ràng, có nút quay lại và xác nhận an toàn cho mọi thao tác destructive.

**Architecture:** Một `AppDialog` native dùng chung thay mọi `confirm()`/dialog rải rác; `displayName` là một fallback UI duy nhất. Data migration chỉ bổ sung tên trống, không đụng tên hợp lệ.

**Tech Stack:** Django, React, TypeScript, Vitest; không thêm dependency.

## Global Constraints

- Ưu tiên `full_name`; fallback là email local-part; tuyệt đối không dùng ID làm danh tính chính.
- Dialog centered, scroll nội bộ, focus restore; không đóng qua Cancel/Escape/overlay khi pending.
- Xóa rubric, gỡ Student, vô hiệu hóa account cần confirmation với đúng target/verb.

---

### Task 1: Seed/backfill readable names

**Files:** Create `backend/accounts/migrations/0004_backfill_full_name.py`; modify `backend/accounts/tests/test_seed.py`, current seed migration.

**Produces:** Demo Teacher/Student và legacy account trống tên đều có display name idempotent.

- [ ] **Step 1: Viết failing migration tests.**

```python
legacy = User.objects.create_user("le.thi.an@example.test", "Password1!", role="STUDENT", full_name="")
call_command("migrate", verbosity=0)
legacy.refresh_from_db()
self.assertEqual(legacy.full_name, "Le Thi An")
```

- [ ] **Step 2: Chạy `cd backend; python manage.py test accounts.tests.test_seed -v 2`; expected FAIL vì chưa có migration.**

- [ ] **Step 3: Viết migration chỉ update Teacher/Student có `full_name__isnull=True` hoặc blank, derive readable local-part; seed data dùng tên explicit.**

```python
if not user.full_name or not user.full_name.strip():
    user.full_name = user.email.split("@", 1)[0].replace(".", " ").title()
    user.save(update_fields=("full_name",))
```

- [ ] **Step 4: Rerun focused test; chạy migrate hai lần trong test; commit `fix: backfill readable account names`.**

### Task 2: Shared dialog, display name, greeting and back button

**Files:** Create `frontend/src/components/{AppDialog,BackButton}.tsx` và tests; modify `frontend/src/{auth.tsx,AppShell.tsx,styles.css}`.

**Interfaces:** `displayName(user)`, `<AppDialog open title pending onClose>`, `<BackButton fallbackHref>`.

- [ ] **Step 1: Viết Vitest fail cho fallback tên, greeting Vietnamese role, history back/fallback, Cancel/Escape/overlay và focus restore.**

```tsx
render(<BackButton fallbackHref="/teacher/classes" />);
fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
expect(location.assign).toHaveBeenCalledWith("/teacher/classes");
```

- [ ] **Step 2: Chạy `cd frontend; npm test -- AppDialog BackButton`; expected FAIL.**

- [ ] **Step 3: Implement native dialog and BackButton; greeting is `Chào, {displayName(user)}` plus `Quản trị viên/Giáo viên/Học sinh`; style max height/width for 320px.**

```tsx
export const displayName = (user: Pick<User, "full_name" | "email">) => user.full_name?.trim() || user.email.split("@", 1)[0];
```

- [ ] **Step 4: Rerun focused tests and `npm run build`; commit `feat: add shared dialog and authenticated greeting`.**

### Task 3: Replace unsafe action UI

**Files:** Modify `AdminUsersPage.tsx`, `AdminClassPage.tsx`, `TeacherClassPage.tsx`, their tests.

- [ ] **Step 1: Viết failing UI tests: Cancel makes zero requests; confirm one request; dialog stays with server `422`; rubric criterion delete is confirmed and changes local draft only after confirm.**

- [ ] **Step 2: Thay `window.confirm`, all raw `<dialog>`, plain My Classes links bằng Task 2 components; use `Vô hiệu hóa`, `Gỡ`, `Xóa` with the target display name.**

```tsx
<AppDialog open={!!removing} title={`Gỡ ${displayName(removing)}`} pending={saving} onClose={() => setRemoving(null)} />
```

- [ ] **Step 3: Run `cd frontend; npm test; npm run build`; inspect every dialog at 320px and desktop; commit `feat: confirm destructive actions`.**

## Feature Gate

Migration is idempotent; all listed dialogs obey pending rules; no main student identity uses numeric ID/version.

