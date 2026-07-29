# Feature: Notifications & Class Resources

Part of [00-system-overview](00-system-overview.md). Backend apps: `notifications/` (Notification) and `classes/` (ClassResource — same app as Classes, grouped here because it's the trigger source for notifications). Frontend: `AppShell` (notification bell), `components/ClassResources`, `StudentClassPage`.

## 1. Purpose

Lightweight in-app notification fan-out to students when a teacher publishes something new in their Class (an assignment, or a resource link). No email/push — local-only, read inside the app shell.

## 2. Screens (ASCII)

### 2.1 Notification bell (`AppShell`, Teacher/Student only — not shown for Admin)

```
+-------------------------------+
| Bell  Notifications  [3]      |  <- unread badge
+-------------------------------+
  (expanded)
  - New assignment: Homework 2      -> links to /student/assignments/{id}
  - New resource: Slide deck        -> links to /student/classes/{id}
  (No notifications.)
```
Clicking an item marks it read and navigates via its `link`.

### 2.2 Class resources (inside Student Class detail, `/student/classes/{id}`)

```
Class resources
- Slide deck (external link) — Week 1 slides
- Reference repo (external link)
(No resources yet.)
```

### 2.3 Teacher-side resource management

Resources are created via `POST /api/classes/{id}/resources` (title, description, URL). No dedicated teacher UI screen was found wired up yet beyond the API + the `components/ClassResources` display component — treat resource *creation* UI as owned by whichever screen embeds `ClassResources`; verify against the current `TeacherClassPage`/related component before building on it.

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/notifications` | Authenticated | Returns `{unread_count, items[]}`, newest first |
| POST | `/api/notifications/{id}/read` | Authenticated (own) | Idempotent — no-op if already read |
| GET | `/api/classes/{id}/resources` | Teacher, Student (scoped) | List resources for a Class |
| POST | `/api/classes/{id}/resources` | Owning Teacher | Create a resource; triggers notification fan-out |

## 4. DB

**`notifications`**

| Field | Notes |
|---|---|
| `recipient_id` | FK → users |
| `type` | e.g. `ASSIGNMENT_CREATED`, `RESOURCE_CREATED` |
| `title`, `link` | display text + client-side route to open |
| `created_at`, `read_at` | `read_at IS NULL` = unread |

**`class_resources`** (table `classes.ClassResource`)

| Field | Notes |
|---|---|
| `classroom_id` | FK → classes |
| `title`, `description` | |
| `url` | external link, up to 2048 chars |

## 5. Key functions / rules

- `create_notifications(classroom, type, title, link)` (`notifications/services.py`) — `bulk_create`s one `Notification` per currently-enrolled student. Called from two places today: `ClassAssignmentsView.post` (new assignment) and `ClassResourcesView.post` (new resource).
- Notifications are a snapshot at creation time: a student enrolled *after* the assignment/resource was created will not retroactively get one.
- No delete/expiry mechanism — `read_at` is the only state transition; there's no "unread again" or "dismiss without reading".

## 6. Edge cases

- A student who was unenrolled after a notification was sent still has (and can read) that notification — it's tied to `recipient_id`, not current enrollment.
- Resource creation on a Class that has ended: `ClassResourcesView.post` does not check `is_open`/`is_ended` the way assignments do — confirm this is intentional before relying on it if resources are meant to close with the Class.
