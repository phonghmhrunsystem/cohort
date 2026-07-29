# Feature: Notifications & Class Resources

Part of [00-system-overview](00-system-overview.md). Backend apps: `notifications/` (Notification) and `classes/` (ClassResource — same app as Classes, grouped here because it's the trigger source for notifications). Frontend: `AppShell` (notification bell), `components/ClassResources`, `StudentClassPage`.

## 1. Purpose

Lightweight in-app notification fan-out. Two shapes, one table:

- **To students** — when a teacher publishes something new in their Class (an assignment, or a resource link). Fans out to the whole enrolled roster.
- **To one teacher** — when an admin assigns or unassigns them a Class ([02 §5](02-classes-and-enrollment.md#5-key-functions--rules)). A single recipient, not a fan-out.

No email/push — local-only, read inside the app shell.

## 2. Screens (ASCII)

### 2.1 Notification bell (`AppShell`, Teacher/Student only — not shown for Admin)

The bell lives in a **top bar pinned to the right edge of the content column, at every breakpoint**. Today `.workspace-topbar` is `d-md-none` — mobile only — so on desktop there is no bar to hang it off; the bell sits inside the sidebar as a `<details>`. Moving it out needs one structural change to the shell — the one place these docs go below the component level, because the bell cannot be where the design puts it until this lands (see the Altitude note at the top of [00](00-system-overview.md)):

```
.workspace (display: flex)
├── aside.workspace-sidebar          fixed overlay < 768px, sticky column >= 768px
└── div.workspace-main               flex column, flex: 1, min-width: 0   <- NEW wrapper
    ├── header.workspace-topbar      sticky top, all breakpoints
    └── main.workspace-content
```

The wrapper exists because `.workspace` is a flex **row**: with the header as a direct child it becomes a third column on desktop instead of a bar. Drop `.workspace-topbar { display: none !important }` from the `min-width: 768px` block once it's in place. On desktop the brand hides (the sidebar already shows it) and the bar is otherwise empty — deliberate, it's the slot the next global control lands in.

```
+---------------------------------------------------------------+
|  [=]  Class Management                              ( 🔔 3 )   |  <- badge = unread
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

**Bell button** — `<button aria-expanded aria-controls="notif-panel" aria-label="Thông báo, 3 chưa đọc">`. The badge is a `--color-accent` pill positioned over the icon's top-right, capped at `99+`, and **not rendered at all when `unread_count` is 0** (an empty badge reads as a bug). It replaces the current `<details>`, which cannot close on an outside click.

**Panel** — `position: absolute; right: 0; top: 100%`, `width: 22rem`, `max-width: calc(100vw - 1rem)`, `max-height: 24rem` with `overflow-y: auto`, on `--color-surface` with `--radius-md` / `--shadow-md`, `z-index: 1035` (above `.workspace-topbar`'s 1030, below the sidebar's 1050 so the mobile drawer still wins). Below 480px it stretches to a full-width sheet.

**Item** — `[unread dot] [type icon] [title, clamped to 2 lines] [relative time]`. Unread rows get a `--color-primary-soft` background plus an accent dot; read rows are plain. `ASSIGNMENT_CREATED` takes the clipboard icon in primary, `RESOURCE_CREATED` the book icon in accent, `CLASS_ASSIGNED` / `CLASS_UNASSIGNED` the people icon in primary, anything else falls back to the bell — the fallback matters because `type` is a free `CharField` ([§4](#4-db)), not a constrained enum.

A Teacher's bell only ever holds `CLASS_ASSIGNED` / `CLASS_UNASSIGNED` rows — teachers are never on a fan-out ([§5](#5-key-functions--rules)). That is a handful of rows a year, so the panel is empty most of the time and the badge rarely appears; that is the expected steady state, not a broken feed.

**Interactions**

| Action | Result |
|---|---|
| Click bell | Toggles the panel and **refetches the list on open**. No polling, no websocket — the list is only ever looked at when it's opened |
| Click item | Marks read optimistically, then navigates to `link`. A row with `link = null` (`CLASS_UNASSIGNED`) still marks read but does not navigate — it renders as text, not a link |
| Click "Đánh dấu đã đọc tất cả" | One request ([§3](#3-api)); every `read_at` set locally and the badge cleared before it returns. Disabled at `unread_count === 0` |
| Click outside / `Escape` | Closes and returns focus to the bell |
| Any of the above fails | The optimistic state rolls back and the badge returns to its server value |

Relative time is computed client-side from `created_at`: `Vừa xong` → `N phút trước` → `N giờ trước` → `Hôm qua` → `N ngày trước` (under 7 days) → `dd/MM/yyyy`. The frontend `Notification` type has to pick up `type` and `created_at`; `NotificationSerializer` already returns both, only the TS type omits them.

**Deliberately out of scope**: no pagination (the panel scrolls; `ponytail:` add `?limit=20` when a real account makes the list long), no All/Unread tabs (the unread background already carries that), no dismiss or delete — `read_at` stays the only state transition ([§5](#5-key-functions--rules)).

- `ASSIGNMENT_CREATED` links to `/student/assignments/{id}` — the single student assignment page ([04 §2.1](04-submissions.md#21-student--assignment-detail--submissions-studentassignmentsid)), same destination as every row action in the Assignments table ([03 §2.2](03-assignments-and-rubrics.md#22-student--assignments-tab-studentclassesid)). One route in means the notification can't land on a screen that no longer exists.
- **The link carries no state and is never stale in a wrong way.** A notification read three weeks late opens the same page, which by then reads `Đã đóng` or shows the result section — `learning_state` is computed at render time ([03 §5](03-assignments-and-rubrics.md#5-key-functions--rules)), so the notification never has to be updated, expired, or deleted when the assignment's situation changes. That is the whole reason `link` is a route and not a snapshot of anything.
- The title is captured at creation (`f"New assignment: {assignment.title}"`). A teacher who renames the assignment before `due_at` leaves an old title in the bell — accepted: the link still resolves to the right page, and rewriting sent notifications is not worth a fan-out update.

### 2.2 Class resources (inside Student Class detail, `/student/classes/{id}`, "Class resources" tab — see [02-classes-and-enrollment §2.5](02-classes-and-enrollment.md#25-student--my-classes--class-detail))

```
Class resources
- Slide deck (external link) — Week 1 slides
- Reference repo (external link)
(No resources yet.)
```

### 2.3 Teacher-side resource management

Resources are created via `POST /api/classes/{id}/resources` (title, description, URL). No dedicated teacher UI screen is wired up yet beyond the API + the `components/ClassResources` display component — treat resource *creation* UI as owned by whichever screen embeds `ClassResources`; verify against the current `TeacherClassPage`/related component before building on it.

Resources are deliberately **not** on the assignment lifecycle. Unlike assignments, `ClassResourcesView.post` checks neither `is_open(classroom)` nor any deadline ([03 §5](03-assignments-and-rubrics.md#5-key-functions--rules)), and there is no expiry, edit-freeze or delete path. A link is reference material, not graded work: posting slides to a finished Class is a normal thing to do, and nothing downstream reads a resource for state. Two consequences follow, both real today:

- A teacher can add resources to an ended Class; students still enrolled will see them and be notified.
- **Resource creation writes no audit row** — see [08 §5.1](08-audit-log.md#51-what-is-not-audited). Assignment creation does.

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/notifications` | Authenticated | Returns `{unread_count, items[]}`, newest first |
| POST | `/api/notifications/{id}/read` | Authenticated (own) | Idempotent — no-op if already read |
| POST | `/api/notifications/read-all` | Authenticated (own) | **Not built yet** — see below. One bulk `update(read_at=now())` over `recipient=user, read_at IS NULL`; returns `{unread_count: 0}`. Idempotent |
| GET | `/api/classes/{id}/resources` | Teacher, Student (scoped) | List resources for a Class |
| POST | `/api/classes/{id}/resources` | Owning Teacher | Create a resource; triggers notification fan-out |

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
| `url` | external link, up to 2048 chars |

## 5. Key functions / rules

- `create_notifications(classroom, type, title, link)` (`notifications/services.py`) — the **roster fan-out**: `bulk_create`s one `Notification` per currently-enrolled student, inside the caller's `transaction.atomic()` so the fan-out and the thing it announces commit together. Called from two places: `ClassAssignmentsView.post` (new assignment) and `ClassResourcesView.post` (new resource).
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
- Resource created on an ended Class → allowed, and enrolled students are notified. See [§2.3](#23-teacher-side-resource-management).
- Badge over 99 unread → renders `99+`. Nothing truncates the list itself; the panel just scrolls ([§2.1](#21-notification-bell-appshell-teacherstudent-only--not-shown-for-admin)).
- `GET /api/notifications` fails when the panel opens → the panel shows `Không tải được thông báo.` and keeps the previously loaded items. The badge is not zeroed on a failed fetch — a network error is not evidence that anything was read.
- "Đánh dấu đã đọc tất cả" clicked with zero unread → the button is disabled, and the endpoint is a no-op anyway. The same user clicking it in two tabs is also a no-op the second time: the `read_at IS NULL` filter matches nothing.
- A notification created *while* the panel is open → not shown until the next open, since the list is only fetched on open. Accepted; the alternative is polling for an event that arrives a few times a week.
- `url` up to 2048 chars is stored as given and rendered as an external link — no fetch, no preview, no allow-list. Resources are teacher-authored inside their own Class.
