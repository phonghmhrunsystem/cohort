# Feature: Notifications & Class Resources

Part of [00-system-overview](00-system-overview.md). Backend apps: `notifications/` (Notification) and `classes/` (ClassResource — same app as Classes, grouped here because it's the trigger source for notifications). Frontend: `AppShell` (notification bell), `components/ClassResources`, `StudentClassPage`.

## 1. Purpose

Lightweight in-app notification fan-out. Two shapes, one table:

- **To students** — when a teacher publishes something new in their Class (an assignment, or a resource link). Fans out to the whole enrolled roster.
- **To one teacher** — when an admin assigns or unassigns them a Class ([02 §5](02-classes-and-enrollment.md#5-key-functions--rules)). A single recipient, not a fan-out.

No email/push — local-only, read inside the app shell.

## 2. Screens (ASCII)

### 2.1 Notification bell (`AppShell`, Teacher/Student only — not shown for Admin)

The bell lives in the **header at the top of the content column, right-aligned, at every breakpoint**. The shell already provides that slot — no structural change is needed:

```
.app-shell
├── aside.sidebar                    fixed drawer < 1024px, grid column >= 1024px
└── main.canvas
    ├── header                       present at every breakpoint
    │   └── .header-actions          [bell] [UserMenu]
    └── (page content)
```

The bell replaces the `<Link className="notification-link" to="/notifications">` that sits in `.header-actions` today, and the `/notifications` route (a placeholder heading) goes away with it — the panel is the whole feature, there is no full-page notification list.

```
+---------------------------------------------------------------+
|  [=]                              ( 🔔 3 )  ( 👤 Ada Teacher ) |  <- badge = unread
|   ^ menu button, mobile only                                  |
+---------------------------------------------------------------+
                                  +----------------------------------------+
                                  | Thông báo         Đánh dấu đã đọc tất cả|
                                  +----------------------------------------+
                                  | ● 📋 Bài tập mới: Homework 2           |
                                  |      2 giờ trước                       |
                                  | ● 📚 Tài liệu mới: Slide deck          |
                                  |      Hôm qua                           |
                                  |   📋 Bài tập mới: Homework 1           |
                                  |      12/07/2026                        |
                                  +----------------------------------------+
                                  (Chưa có thông báo nào.)
```

**Bell button** — `<button aria-expanded aria-controls="notif-panel" aria-label="Thông báo, 3 chưa đọc">`. The badge is a `--color-accent` pill positioned over the icon's top-right, capped at `99+`, and **not rendered at all when `unread_count` is 0** (an empty badge reads as a bug). It replaces the current link, which navigates away instead of opening in place.

**Panel** — the same dropdown idiom as `UserMenu` (`.action-menu-panel`: `--color-surface`, 1px `--color-border`, `.5rem` radius, `0 4px 12px #0f172a20`), sized for a list: `position: absolute; right: 0; top: 100%`, `width: 22rem`, `max-width: calc(100vw - 1rem)`, `max-height: 24rem` with `overflow-y: auto`. `z-index: 15` — above `.action-menu-panel`'s 10, below the drawer backdrop (20) and the sidebar (21) so the mobile drawer still wins. Below 480px it stretches to a full-width sheet. Radius and shadow stay literal rather than becoming `--radius-md` / `--shadow-md` tokens: those names are Tailwind v4's own `@theme` namespace, and declaring them would silently reshape every `rounded-md` / `shadow-md` utility in the app.

**Item** — `[unread dot] [type icon] [title, clamped to 2 lines] [relative time]`. Unread rows get a `--color-primary-soft` background plus an accent dot; read rows are plain. `ASSIGNMENT_CREATED` takes the clipboard icon in primary, `RESOURCE_CREATED` the book icon in accent, `CLASS_ASSIGNED` / `CLASS_UNASSIGNED` the people icon in primary, anything else falls back to the bell — the fallback matters because `type` is a free `CharField` ([§4](#4-db)), not a constrained enum.

A Teacher's bell only ever holds `CLASS_ASSIGNED` / `CLASS_UNASSIGNED` rows — teachers are never on a fan-out ([§5](#5-key-functions--rules)). That is a handful of rows a year, so the panel is empty most of the time and the badge rarely appears; that is the expected steady state, not a broken feed.

**Interactions**

| Action | Result |
|---|---|
| Click bell | Toggles the panel and **refetches the list on open** — the item list is only fetched when it's about to be read |
| (no click) | The **badge polls `GET /api/notifications/unread-count` every 30s** while the tab is visible, and again the moment the tab becomes visible ([§2.1.1](#211-the-badge-updates-on-its-own)). Only the count polls; the list does not |
| Click item | Marks read optimistically, then navigates to `link`. A row with `link = null` (`CLASS_UNASSIGNED`) still marks read but does not navigate — it renders as text, not a link |
| Click "Đánh dấu đã đọc tất cả" | One request ([§3](#3-api)); every `read_at` set locally and the badge cleared before it returns. Disabled at `unread_count === 0` |
| Click outside / `Escape` | Closes and returns focus to the bell |
| Any of the above fails | The optimistic state rolls back and the badge returns to its server value |

Relative time is computed client-side from `created_at` by `relativeTime` in `lib/format`: `Vừa xong` → `N phút trước` → `N giờ trước` → `Hôm qua` → `N ngày trước` (under 7 days) → `dd/MM/yyyy`, the last step reusing `formatDate`. There is no frontend `Notification` type yet — `types.ts` has none; it is defined with all six serializer fields (`id`, `type`, `title`, `link`, `created_at`, `read_at`), plus `NotificationList` for `{unread_count, items}`, and `type` stays a widened string so an unrecognised value still type-checks into the icon fallback.

**Two new theme tokens**, both in the `@theme` block of `styles.css` (colours are never hardcoded in a component): `--color-accent` for the badge and the unread dot — deliberately not `--color-danger`, an unread notification is not an error — and `--color-primary-soft` for the unread row background.

**Deliberately out of scope**: no pagination (the panel scrolls; `ponytail:` add `?limit=20` when a real account makes the list long), no All/Unread tabs (the unread background already carries that), no dismiss or delete — `read_at` stays the only state transition ([§5](#5-key-functions--rules)).

- `ASSIGNMENT_CREATED` links to `/student/assignments/{id}` — the single student assignment page ([04 §2.1](04-submissions.md#21-student--assignment-detail--submissions-studentassignmentsid)), same destination as every row action in the Assignments table ([03 §2.2](03-assignments-and-rubrics.md#22-student--assignments-tab-studentclassesid)). One route in means the notification can't land on a screen that no longer exists.
- **The link carries no state and is never stale in a wrong way.** A notification read three weeks late opens the same page, which by then reads `Đã đóng` or shows the result section — `learning_state` is computed at render time ([03 §5](03-assignments-and-rubrics.md#5-key-functions--rules)), so the notification never has to be updated, expired, or deleted when the assignment's situation changes. That is the whole reason `link` is a route and not a snapshot of anything.
- The title is captured at creation (`f"New assignment: {assignment.title}"`). A teacher who renames the assignment before `due_at` leaves an old title in the bell — accepted: the link still resolves to the right page, and rewriting sent notifications is not worth a fan-out update.

#### 2.1.1 The badge updates on its own

The badge does not wait for a click. `NotificationBell` calls `GET /api/notifications/unread-count` ([§3](#3-api)) on mount, then every 30 seconds, and again on every `visibilitychange` that leaves the tab visible. It polls **only while the tab is visible** and **only while the panel is closed** — an open panel has already refetched the full list, and a poll landing mid-read would overwrite the optimistic state behind "Đánh dấu đã đọc tất cả". A failed poll keeps the previous count: a network error is not evidence that anything was read.

The item list is deliberately left out of the poll. Refetching rows on a timer would replace the row under a user's cursor mid-click, and the panel is only looked at when it is open anyway — so the badge is live and the list is on-demand.

Polling instead of SSE or WebSockets is a deployment decision, not a performance one: `unread-count` is a single indexed `COUNT(*)` that loads no rows, while SSE would put the backend on ASGI and Channels would add a channel layer — real infrastructure for an event that fires a few times a week per user. If that volume ever changes, SSE replaces the poll without changing the client contract.

### 2.2 Class resources (inside Student Class detail, `/student/classes/{id}`, "Class resources" tab — see [02-classes-and-enrollment §2.5](02-classes-and-enrollment.md#25-student--my-classes--class-detail))

```
Class resources
- Slide deck                        ↗ external link — Week 1 slides
- Giáo trình.pdf                    ⤓ giao-trinh.pdf · 2.4 MB
(Chưa có tài liệu nào.)
```

The tab is the Student class page's **default** tab (`?tab=resources`), so this list is the first thing a student sees on the page — an unordered dump would read as a bug. `GET /api/classes/{id}/resources` returns newest first (`order_by("-id")`); `ClassResource` has no `created_at` and no `Meta.ordering`, so without that clause the order is whatever the database happens to return.

A row renders by `kind` ([§4](#4-db)): a **link** is an `<a target="_blank" rel="noopener noreferrer">` on the title, a **file** is a button that downloads. The description sits below either one, and a file row also carries its original filename and size — a student should know what they are about to pull down before they pull it. A failed load shows `Không tải được tài liệu.` rather than the empty state — "no resources" and "we could not ask" are different facts; a failed download raises a toast, since the list itself is still fine.

Downloads go through `GET /api/classes/{id}/resources/{resource_id}/download` with the Bearer token, not through `MEDIA_URL`, so a `<a href>` cannot be used: the bytes are fetched and handed to the browser as a blob URL by `downloadBlob` in `lib/api`, the same path submission downloads take. The file is therefore scoped to the Class like every other read — an unrouted `MEDIA_ROOT` means a guessed URL gets nothing.

The same `components/ClassResources` renders both roles' lists ([§2.3](#23-teacher-side-resource-management)); it owns the fetch, the list, and — behind a `manage` flag — the whole teacher-side write surface.

### 2.3 Teacher-side resource management

The **"Class resources" tab on `TeacherClassPage`** (`?tab=resources`, alongside Students / Assignments / Bảng điểm) renders `components/ClassResources` with `manage`, which adds a create form above the list and a Sửa / Xoá pair on each row. The page passes nothing else: keeping the form next to the list it mutates is what lets both roles share one component instead of two that drift.

```
( • Liên kết  ( ) Tệp tin )
[ Title ] [ Description ] [ https://… | Chọn tệp ]   ( Tạo tài liệu )
```

A Liên kết / Tệp tin switch swaps the URL field for a file input; title and description are shared. A link posts JSON, a file posts `multipart/form-data`. Creation is inline rather than in a `Dialog` like assignment create — a few plain fields with no lifecycle rules behind them do not earn a modal, and the teacher wants to see the list grow as they add.

- **Sửa** turns the row into the same form, prefilled, and `PATCH`es. A file row shows its current filename; leaving the file input empty keeps the current file, so a rename does not require re-uploading. Switching kind clears the other side, and the replaced file is deleted from disk once the write commits.
- **Xoá** confirms in the existing `Dialog` before `DELETE` — a click that removes a file from disk should not be a single misplaced one.

Field errors come straight from the serializer's `422` body onto the matching field: `title` 2–150 chars after strip, `url` an absolute `https` URL up to 2048 chars, `file` 25 MiB max with a whitelisted extension ([§4](#4-db)).

Resources are deliberately **not** on the assignment lifecycle. Unlike assignments, no resource route checks `is_open(classroom)` or any deadline ([03 §5](03-assignments-and-rubrics.md#5-key-functions--rules)), and there is no expiry or edit-freeze. A resource is reference material, not graded work: posting slides to a finished Class is a normal thing to do, and nothing downstream reads a resource for state. Three consequences follow, all real today:

- A teacher can add, edit and delete resources on an ended Class; students still enrolled will see the result.
- **Only creation notifies.** An edit or a delete is silent — a fan-out per typo fix is the fastest way to make a bell get ignored ([§5.1](#51-what-does-not-notify)).
- **No resource write is audited**, creation included — see [08 §5.1](08-audit-log.md#51-what-is-not-audited). Assignment creation is. Delete is destructive, but a resource carries no grade, no submission and no lifecycle state; auditing only the delete would make this table's coverage arbitrary.

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/notifications` | Authenticated | Returns `{unread_count, items[]}`, ordered `-created_at, -id` |
| GET | `/api/notifications/unread-count` | Authenticated (own) | `{unread_count}` — one `COUNT(*)`, no rows loaded. The badge's poll target ([§2.1.1](#211-the-badge-updates-on-its-own)) |
| POST | `/api/notifications/{id}/read` | Authenticated (own) | Idempotent — no-op if already read. Someone else's id is a `404`, not a `403` |
| POST | `/api/notifications/read-all` | Authenticated (own) | One bulk `update(read_at=now())` over `recipient=user, read_at IS NULL`; returns `{unread_count: 0}`. Idempotent |
| GET | `/api/classes/{id}/resources` | Teacher, Student (scoped) | List resources for a Class, newest first. Admin is in `scoped_classes` but gets `403` here — resources are course material, not an admin surface |
| POST | `/api/classes/{id}/resources` | Owning Teacher | Create a resource — JSON for a link, `multipart/form-data` for a file. Triggers the notification fan-out |
| PATCH | `/api/classes/{id}/resources/{resource_id}` | Owning Teacher | Partial: title, description, and optionally a new link or a new file. Switching kind clears the other side and deletes the replaced file. **No notification** |
| DELETE | `/api/classes/{id}/resources/{resource_id}` | Owning Teacher | Hard delete; the stored file goes with the row. `204`. **No notification** |
| GET | `/api/classes/{id}/resources/{resource_id}/download` | Teacher, Student (scoped) | `FileResponse(as_attachment=True)` under the original filename. `404` when the resource is a link |

The write routes are nested under the Class so scoping is one `owned_class` call, the same shape the list route already uses; a flat `/api/resources/{id}` would have to re-derive the Class to answer "may this student see it". A non-owning teacher, a student and an Admin all get `404` on a write — they cannot address the Class either, so `403` would be a claim they had found something.

The list orders by `-created_at, -id`, not `-created_at` alone: a roster fan-out is one `bulk_create`, so every row it writes shares a `created_at` to the microsecond, and without the tie-break their relative order is whatever the database returns — different between SQLite and Postgres, and not necessarily stable between two calls.

`read-all` is a new endpoint rather than the client looping `POST /{id}/read` over the list: the loop fires one request per unread row (30 assignments in a Class is 30 requests), and a partial failure leaves the badge disagreeing with the database with no obvious way to reconcile. The server-side version is a single queryset `update()` — it never loads a row, and there is no per-row failure to half-apply. Unlike the per-id route it takes no `read_at IS NULL` guard in Python because the `WHERE` clause already carries it.

## 4. DB

**`notifications`**

| Field | Notes |
|---|---|
| `recipient_id` | FK → users |
| `type` | `ASSIGNMENT_CREATED`, `RESOURCE_CREATED`, `CLASS_ASSIGNED`, `CLASS_UNASSIGNED`. A free `CharField`, not a DB enum — the UI icon map falls back to the bell for anything unrecognised ([§2.1](#21-notification-bell-appshell-teacherstudent-only--not-shown-for-admin)) |
| `title`, `link` | display text + client-side route to open. `link` is nullable; only `CLASS_UNASSIGNED` uses that today |
| `created_at`, `read_at` | `read_at IS NULL` = unread |

**`class_resources`** (table `classes.ClassResource`)

| Field | Notes |
|---|---|
| `classroom_id` | FK → classes |
| `title`, `description` | |
| `url` | external `https` link up to 2048 chars; empty for a file resource |
| `file_path` | storage key under `MEDIA_ROOT` (`resources/<uuid>.<ext>`); empty for a link |
| `original_filename` | shown in the list and used as the download filename |
| `content_type` | derived server-side from the extension — the browser-sent type is discarded |
| `size` | bytes; `null` for a link |

A `CheckConstraint` (`class_resource_link_xor_file`) enforces exactly one of `url` / `file_path` non-empty, so a code path that forgets to validate cannot write a row nothing can render. `kind` is **derived, not stored** (`"file" if file_path else "link"`) — a stored kind is a second source of truth that can disagree with the columns.

Uploads are capped at `settings.MAX_UPLOAD_BYTES` (25 MiB, the submission limit) and whitelisted by extension: `.pdf .doc .docx .ppt .pptx .xls .xlsx .txt .zip`. Where the extension has a stable signature the header is sniffed the same way submissions do (`%PDF-`, `PK\x03\x04`, OLE2 `\xD0\xCF\x11\xE0`); `.txt` has none and passes on the extension alone.

## 5. Key functions / rules

- `create_notifications(classroom, type, title, link)` (`notifications/services.py`) — the **roster fan-out**: `bulk_create`s one `Notification` per currently-enrolled student, inside the caller's `transaction.atomic()` so the fan-out and the thing it announces commit together. Called from two places: `ClassAssignmentsView.post` (new assignment) and `ClassResourcesView.post` (new resource). `ClassResourceDetailView` calls neither — edit and delete are silent ([§2.3](#23-teacher-side-resource-management)).
- `notify_user(recipient, type, title, link)` (same module) — the **single-recipient** write, one row, same transaction rule. Called only from the teacher-reassignment path ([02 §5](02-classes-and-enrollment.md#5-key-functions--rules)), twice per reassignment: `CLASS_UNASSIGNED` to the outgoing teacher, `CLASS_ASSIGNED` to the incoming one. It exists because a fan-out helper keyed on `classroom.enrollments` has no way to address a teacher — the teacher is not enrolled in their own Class.
- The fan-out reads `classroom.enrollments` with **no `is_active` filter** — a disabled account gets rows it will never see, since it can't log in ([01](01-auth-and-accounts.md)). Harmless and cheaper than the filter: the rows are per-recipient and nothing else reads them. `notify_user` applies no `is_active` check either, for the same reason.
- `CLASS_ASSIGNED` links to `/teacher/classes/{id}`; `CLASS_UNASSIGNED` carries **no link** (`link = null`) — the outgoing teacher is out of `scoped_classes` the moment the write commits, so any route into that Class would `404` for them ([02 §6](02-classes-and-enrollment.md#6-edge-cases)). The panel renders a linkless row as plain text, not a dead click.
- Notifications are a snapshot at creation time: a student enrolled *after* the assignment/resource was created will not retroactively get one.
- No delete/expiry mechanism — `read_at` is the only state transition; there's no "unread again" or "dismiss without reading".

### 5.1 What does *not* notify

Only creation notifies, plus the one admin action that moves a Class between teachers. Every other event is silent today, and the gap is per-event, not accidental:

| Event | Notified? | Why |
|---|---|---|
| Assignment created | **yes** | New work exists; nothing else tells the student |
| Resource created | **yes** | Same |
| Teacher reassigned ([02 §5](02-classes-and-enrollment.md#5-key-functions--rules)) | **yes** | Both teachers, one row each (`CLASS_ASSIGNED` / `CLASS_UNASSIGNED`). The incoming teacher has coursework waiting and no other signal; the outgoing one watches a Class vanish from their list and deserves the reason. Students are **not** notified — the teacher's name on the Class page is the change they see |
| `due_at` moved ([03 §5](03-assignments-and-rubrics.md#5-key-functions--rules)) | no | **The real gap.** A deadline can only move while the assignment is open, and it moves for the whole class — exactly the change a student needs to know about. Nothing announces it; the new date shows up silently in `deadline_badge`. `ponytail:` if one notification type gets added next, make it this one |
| Title/description edited | no | Cosmetic before the deadline, impossible after |
| Rubric changed | no | Only possible before any grade exists ([05 §5.2](05-grading-and-results.md#52-grading-is-a-one-way-door-in-three-directions)); students don't see rubric weights until they see a result anyway |
| **Graded** ([05](05-grading-and-results.md)) | no | The student learns by opening the Class, where `learning_state` flips to `Đã chấm` and the Điểm column fills in ([03 §2.2](03-assignments-and-rubrics.md#22-student--assignments-tab-studentclassesid)). `ponytail:` `GRADE_CREATED` is a three-line addition in `grade_submission` when someone asks for it — it is not in because nobody has, not because it would be hard |
| Enrolled / unenrolled from a Class | no | Enrollment is a teacher action a student sees in "My classes" ([02](02-classes-and-enrollment.md)) |
| Submission received | no | It would notify the teacher, and the teacher's list already carries `12/24` ([04 §2.2](04-submissions.md#22-teacher--assignment-submissions-teacherassignmentsid)). A bell that fires 24 times per assignment is a bell that gets ignored |

Stated as a table because "why didn't I get a notification for X" is the predictable support ticket, and the answer is different for each X.

## 6. Edge cases

- A student who was unenrolled after a notification was sent still has (and can read) that notification — it's tied to `recipient_id`, not current enrollment. **Clicking it dead-ends**: `/student/assignments/{id}` is scoped to enrolled students ([03 §3](03-assignments-and-rubrics.md#3-api)), so they get a 404/not-in-scope page, not the assignment. Accepted — the alternative is deleting notifications on unenroll, which contradicts append-only-ish behaviour for a rare case; the row is also the only trace the student ever had access.
- A notification read long after `due_at` → the link still opens the assignment page, which shows `Đã đóng` and no submit form ([04 §2.1](04-submissions.md#21-student--assignment-detail--submissions-studentassignmentsid)). Nothing has to be cleaned up.
- A notification for an assignment the student has already submitted or been graded on → same page, showing history and the result section ([05 §2.2](05-grading-and-results.md#22-student--my-result-section-of-studentassignmentsid)). The bell never disagrees with the Class page because it doesn't carry state.
- Assignment creation fails after the fan-out (validation, DB error) → both roll back together; there is no orphan "New assignment" pointing at nothing. Same for a reassignment: the `teacher_id` write, the audit row and both `notify_user` rows share one transaction, so a teacher is never told about a Class that didn't move.
- Outgoing teacher opens their `CLASS_UNASSIGNED` row → nothing to click (`link = null`, [§5](#5-key-functions--rules)); the title names the Class, which is all they can still act on. Their old assignments, rubrics and grades keep their authorship ([02 §5](02-classes-and-enrollment.md#5-key-functions--rules)) — they simply have no route to them.
- Admin reassigns a Class to the teacher who already owns it → the `PATCH` is a no-op on `teacher_id`, so no audit row and no notifications. Nobody gets told about a change that didn't happen.
- Resource created, edited or deleted on an ended Class → allowed; only creation notifies. See [§2.3](#23-teacher-side-resource-management).
- Badge over 99 unread → renders `99+`. Nothing truncates the list itself; the panel just scrolls ([§2.1](#21-notification-bell-appshell-teacherstudent-only--not-shown-for-admin)).
- `GET /api/notifications` fails when the panel opens → the panel shows `Không tải được thông báo.` and keeps the previously loaded items. The badge is not zeroed on a failed fetch — a network error is not evidence that anything was read.
- "Đánh dấu đã đọc tất cả" clicked with zero unread → the button is disabled, and the endpoint is a no-op anyway. The same user clicking it in two tabs is also a no-op the second time: the `read_at IS NULL` filter matches nothing.
- A notification created *while* the panel is open → the badge does not move and the row does not appear until the next open: the poll is paused while the panel is open, so an optimistic "đánh dấu đã đọc tất cả" is never overwritten by a count taken a moment earlier ([§2.1.1](#211-the-badge-updates-on-its-own)).
- A tab left open overnight → polling stopped while the tab was hidden and refires the moment it becomes visible, so the badge is at most one round-trip stale when the user comes back.
- A poll fails → the previous count stays on the badge. A network error is not evidence that anything was read.
- A resource is edited after a student opened it → the next list load shows the new title; the `RESOURCE_CREATED` notification keeps the title it was created with, exactly as an assignment rename does ([§2.1](#21-notification-bell-appshell-teacherstudent-only--not-shown-for-admin)).
- A resource with a notification pointing at it is deleted → nothing dangles: the notification links to `/student/classes/{id}`, not to the resource.
- Upload succeeds, the DB write fails → the stored file is deleted in the failure path, so a rollback leaves no orphan on disk.
- Delete succeeds, removing the file fails → the row is gone and a file is orphaned. Accepted: deleting the file inside the transaction would let a rollback leave a row pointing at nothing, which is the worse failure.
- `url` up to 2048 chars is stored as given and rendered as an external link — no fetch, no preview, no allow-list. Resources are teacher-authored inside their own Class.
