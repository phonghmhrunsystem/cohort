# Design: Class resource CRUD (link + file) and a live notification badge

Extends [07-notifications-and-resources](../../overview/07-notifications-and-resources.md). Two independent improvements shipped together because both touch the same screens.

1. **Class resources become a managed list.** A teacher creates, edits and deletes resources; a resource is either an external link or an uploaded document. Students open links in a new tab and download files.
2. **The notification badge updates on its own.** Today the unread count is only fetched when the panel opens, so a user sees nothing until they click the bell.

## 1. Class resources

### 1.1 Data model

`ClassResource` keeps one table and carries either a link or a file — never both, never neither:

| Field | Change | Notes |
|---|---|---|
| `url` | `URLField(max_length=2048, blank=True, default="")` | was required; now empty for a file resource |
| `file_path` | new `CharField(max_length=255, blank=True, default="")` | storage key under `MEDIA_ROOT`, `resources/<uuid>.<ext>` |
| `original_filename` | new `CharField(max_length=255, blank=True, default="")` | shown in the list and used as the download filename |
| `content_type` | new `CharField(max_length=100, blank=True, default="")` | derived server-side from the extension, never from the client |
| `size` | new `PositiveBigIntegerField(null=True, blank=True)` | bytes; `null` for a link |

A `CheckConstraint` (`class_resource_link_xor_file`) enforces exactly one of `url` / `file_path` non-empty, so the invariant survives a code path that forgets to validate. Existing rows are all links, so the migration is additive and the constraint holds without a data migration.

`kind` is **derived, not stored** — `"file" if file_path else "link"`. A stored kind is a second source of truth that can disagree with the columns.

Ordering stays `-id`. `ClassResource` still has no `created_at`; adding one would leave every existing row null and buy nothing the id doesn't already give.

### 1.2 Upload rules

- Max 25 MiB — reuse `settings.MAX_UPLOAD_BYTES`, the same limit as submissions.
- Extension whitelist: `.pdf .doc .docx .ppt .pptx .xls .xlsx .txt .zip`. Anything else is a `422`.
- Where the extension has a stable magic prefix, the header is sniffed the same way submissions do (`%PDF-` for pdf, `PK\x03\x04` for the OOXML/zip family, `\xD0\xCF\x11\xE0` for legacy OLE2 doc/ppt/xls). `.txt` has no signature and is accepted on the extension alone.
- `content_type` is mapped from the extension server-side. The browser-sent type is discarded — it is attacker-controlled and wrong often enough to be useless.

### 1.3 API

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/classes/{id}/resources` | Teacher, Student (scoped) | unchanged; each row now carries `kind`, `url`, `original_filename`, `content_type`, `size` |
| POST | `/api/classes/{id}/resources` | Owning Teacher | JSON (link) or `multipart/form-data` (file). Fans out `RESOURCE_CREATED` as today |
| PATCH | `/api/classes/{id}/resources/{resource_id}` | Owning Teacher | partial: title, description, and optionally a new link or a new file. Switching kind clears the other side. **No notification** |
| DELETE | `/api/classes/{id}/resources/{resource_id}` | Owning Teacher | hard delete; the stored file is removed after the transaction commits. `204`. **No notification** |
| GET | `/api/classes/{id}/resources/{resource_id}/download` | Teacher, Student (scoped) | `FileResponse(as_attachment=True, filename=original_filename)`. `404` when the resource is a link |

Routes are nested under the Class so scoping is one `get_scoped_class` call, exactly like the list route — a flat `/api/resources/{id}` would have to re-derive the Class to answer "may this student see it".

Files are **not** served from `MEDIA_URL`. `MEDIA_ROOT` is not routed publicly, and download goes through the authenticated endpoint so a resource stays scoped to the Class, the same way submission downloads work.

Only creation notifies. An edit or a delete is silent: a fan-out per typo fix is the fastest way to make a bell get ignored, and 07 §5.1 already draws the line at creation.

Resource writes stay **unaudited**, per [08 §5.1](../../overview/08-audit-log.md#51-what-is-not-audited). Delete is destructive, but a resource carries no grade, no submission and no lifecycle state, and auditing only the delete would make the audit trail's coverage of this table arbitrary.

Everything stays off the Class lifecycle — no `is_open` check on create, edit or delete, matching 07 §2.3.

### 1.4 Screens

**Teacher (`/teacher/classes/{id}?tab=resources`)** — the existing inline create form gains a Link/File switch: two radio-style buttons that swap the `url` text field for a file input. Title and description are shared by both. The list below the form is the same `components/ClassResources`, now rendered with `manage` on, which adds a per-row Sửa / Xoá pair of `IconButton`s.

- **Sửa** turns the row into an inline edit form (same fields as create, prefilled). A file resource shows its current filename with a "Chọn tệp khác" input; leaving the input empty keeps the current file. Cancel restores the row.
- **Xoá** opens the existing `Dialog` for confirmation — a delete that removes a file from disk should not be a single misplaced click.
- Field errors come from the `422` body onto the matching field, as create does today.

```
Class resources
( • Liên kết  ( ) Tệp tin )
[ Tiêu đề            ]
[ Mô tả              ]
[ https://...        ]            <- or [ Chọn tệp ] when Tệp tin
                      ( Thêm tài liệu )

- Slide deck                    ↗ liên kết        [Sửa] [Xoá]
    Week 1 slides
- Giáo trình.pdf                ⤓ PDF · 2,4 MB    [Sửa] [Xoá]
```

**Student (`/student/classes/{id}?tab=resources`)** — same list, no manage controls. A link row is an `<a target="_blank" rel="noopener noreferrer">` as today; a file row is a "Tải xuống" button that fetches the bytes with the Bearer token and hands the browser a blob URL, reusing `downloadBlob` in `lib/api`. A file row also shows its type and size so a student knows what they are about to pull down.

Failure copy is unchanged: `Không tải được tài liệu.` for the list, and a toast for a failed download.

## 2. Live notification badge

### 2.1 What changes

A new lightweight endpoint plus a poll in `NotificationBell`. The panel keeps fetching the full list on open — the badge is the only thing that needs to be live.

| Method | Path | Returns |
|---|---|---|
| GET | `/api/notifications/unread-count` | `{"unread_count": n}` |

One indexed `COUNT(*)` over `recipient=user, read_at IS NULL`. It loads no rows and serializes nothing, which is what makes a 30-second cadence acceptable where polling `GET /api/notifications` would not be.

### 2.2 Client behaviour

`NotificationBell` polls every **30 seconds**, and:

- **only while the tab is visible** — `document.visibilityState === "visible"`. A backgrounded tab stops polling entirely.
- **immediately on `visibilitychange` → visible**, so returning to the tab shows the true count without waiting out the interval. This is the case that matters most: the badge is correct the moment the user looks at it.
- **once on mount**, so the badge is right on first paint rather than after 30 seconds.
- **not while the panel is open** — the open panel already refetched the full list, and a poll landing mid-read would fight the optimistic state.

A failed poll is ignored: the previous count stays. A network error is not evidence that anything was read — the same rule the panel already applies.

Polling is deliberately not extended to the item list. Fetching the list on a timer would replace rows out from under a user mid-click, and the panel is only looked at when it's open anyway.

The bell renders for Teacher and Student only, as today, so Admin never polls.

### 2.3 Why polling

SSE would need the backend on ASGI, and WebSockets would need Channels plus a channel layer — real infrastructure changes for an event that fires a handful of times a week per user. A visibility-gated 30-second count query gets the user-visible result ("the badge appears without me clicking") at no deployment cost. If the notification volume ever justifies it, SSE is a drop-in replacement for the poll and the client contract does not change.

## 3. Testing

**Backend** (`classes/tests`, `notifications/tests`):

- POST link and POST file both create; neither-both and neither-nor are `422`.
- Oversized file, disallowed extension, and an extension/magic-byte mismatch are each `422`.
- PATCH renames; PATCH switching link → file clears `url` and vice versa; PATCH creates no notification.
- DELETE removes the row and the stored file; a second DELETE is `404`.
- A non-owning teacher gets `404` on PATCH/DELETE/POST; a student gets `404`; a student outside the Class gets `404` on download.
- Download returns the bytes with `Content-Disposition: attachment` and the original filename; download of a link row is `404`.
- `unread-count` returns the same number as the list's `unread_count`, and `0` for a user with no rows.

**Frontend** (`src/test/components`):

- `ClassResources` renders a link row as an anchor and a file row as a download button.
- With `manage`, edit and delete controls appear; without it they do not.
- Delete asks for confirmation before firing the request.
- `NotificationBell` shows a badge from the poll without the panel being opened, and stops polling when the tab is hidden.

## 4. Edge cases

- **Two teachers, one Class** is impossible today (a Class has one teacher), so no concurrent-edit rules are needed beyond last-write-wins on PATCH.
- **Editing a resource a student already opened** — the student's next list load shows the new title. The `RESOURCE_CREATED` notification keeps its original title, exactly as an assignment rename does (07 §2.1).
- **Deleting a resource that has a notification pointing at it** — the notification links to `/student/classes/{id}`, not to the resource, so it still resolves. Nothing dangles.
- **Upload succeeds, the DB write fails** — the stored file is deleted in the failure path, the same shape submissions use, so a rollback leaves no orphan on disk.
- **Delete succeeds, the file removal fails** — the row is gone and a file is orphaned on disk. Accepted: the alternative is deleting the file inside the transaction, where a rollback would leave a row pointing at nothing, which is the worse failure.
- **A resource on an ended Class** — still creatable, editable and deletable. Resources are off the lifecycle (07 §2.3).
- **A poll that lands while the panel is open** — skipped by the open check, so an optimistic "mark all read" is never overwritten by a stale count.
- **A tab left open overnight** — polling stopped while hidden and refires on focus, so the badge is at most one round-trip stale when the user comes back.
