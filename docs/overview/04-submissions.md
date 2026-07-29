# Feature: Submissions

Part of [00-system-overview](00-system-overview.md). Backend app: `submissions/`. Frontend: `AssignmentPage` (both roles), `components/SubmissionHistory`, `components/LatestSubmissions`.

## 1. Purpose

Versioned file upload per (assignment, student). Every re-upload before the deadline is a new version; a teacher grading list only ever shows the latest version per student.

## 2. Screens (ASCII)

### 2.1 Student — Assignment submissions (`/student/assignments/{id}`)

```
+------------------------------------------------------------+
| < Back                                                        |
| Assignment submissions                                        |
| View my result ->  (link, once graded)                        |
|                                                                |
| Submit a file                                                  |
| PDF or DOCX [ choose file... ]                                 |
| Note        [_________________________]                       |
| [ Upload submission ]                                          |
|                                                                |
| Submission history                                             |
| v3  2026-08-14 21:02  homework_v3.pdf   [ Download ]           |
| v2  2026-08-13 18:40  homework_v2.pdf   [ Download ]           |
| v1  2026-08-10 09:15  homework_v1.docx  [ Download ]           |
+------------------------------------------------------------+
```

### 2.2 Teacher — Assignment submissions (`/teacher/assignments/{id}`)

```
+------------------------------------------------------------+
| Assignment submissions  (latest version per student only)     |
|                                                                |
| Nguyen Van A     v3   homework_v3.pdf   [Download] [Grade]    |
| Tran Thi B       v1   homework_v1.pdf   [Download] [Grade]    |
+------------------------------------------------------------+
```

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/assignments/{id}/submissions` | Teacher (own, latest-per-student), Student (own, all versions) | |
| POST | `/api/assignments/{id}/submissions` | Enrolled Student | `multipart/form-data`: `file`, `note` (optional). `422` if already graded or window closed |
| GET | `/api/submissions/{id}` | Owning Teacher (latest only) or owning Student | |
| GET | `/api/submissions/{id}/download` | Owning Teacher or owning Student | Streams the file; re-checks authorization on every request — the storage path itself is never a public URL |

## 4. DB

**`submissions`**

| Field | Notes |
|---|---|
| `assignment_id`, `student_id`, `version` | unique together; `version` increments per (assignment, student), starting at 1 |
| `file_path` | storage-relative path (UUID-named on disk, `original_filename` kept separately for display/download) |
| `original_filename`, `content_type`, `size` | |
| `note` | optional student note, ≤1000 chars |
| `created_at` | |
| ordering | `-version` (latest first) |

## 5. Key functions / rules

- `can_submit(assignment)` — `classroom.starts_at <= now < classroom.ends_at and now < due_at`. Same window logic as `assignments.is_open`, plus the assignment's own deadline.
- `create_submission(...)` (`submissions/services.py`) is the whole write path, and it's deliberately defensive:
  1. Locks the student's `Enrollment` row for this Class (`select_for_update`, or an `UPDATE` fallback on SQLite) — confirms enrollment still holds and serializes concurrent submits from the same student.
  2. Re-fetches the `Assignment` fresh inside the transaction (avoids acting on stale `due_at`/Class data).
  3. Re-checks `can_submit` and "not already graded" *after* acquiring the lock, not just at the view layer.
  4. Saves the file to storage first, then creates the `Submission` row; if anything after the file save fails, the stored file is deleted (no orphan files).
  5. Retries up to 3 times with backoff on SQLite's "database is locked" `OperationalError` — noted in code as a `ponytail:` shortcut (SQLite-wide write lock); a production DB with real row locking wouldn't need this.
- Version numbering: `(latest.version if latest else 0) + 1`, computed inside the same locked transaction as the insert.
- File validation (type allow-list `.pdf`/`.docx`, MIME, size ≤ 1 GB per the product spec) happens in `SubmissionUploadSerializer` before `create_submission` is ever called.

## 6. Edge cases

- Second upload attempt after a teacher has already graded (even if the deadline hasn't passed) → `422` `GRADED_MESSAGE`.
- Upload attempt exactly at/after `due_at`, or after the Class's `ends_at` → `422` `CLOSED_MESSAGE`.
- Concurrent double-submit from the same student (e.g. two browser tabs) → serialized by the enrollment row lock; the second request either gets the next version cleanly or hits the same business-rule checks post-lock.
- Enrollment removed between page load and upload → `404` (`Enrollment.DoesNotExist` inside the lock → `Http404`).
