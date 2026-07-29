# Feature: Submissions

Part of [00-system-overview](00-system-overview.md). Backend app: `submissions/`. Frontend: `AssignmentPage` (both roles), `components/SubmissionHistory`, `components/LatestSubmissions`.

## 1. Purpose

Versioned file upload per (assignment, student). Every re-upload while submission is still allowed ([§5.2](#52-the-two-stops-and-only-these-two)) is a new version. Versioning is a **student-side concept only**: the student sees their own history, the teacher only ever sees one file per student — the latest — with no version number and no way to reach an older one.

## 2. Screens (ASCII)

### 2.1 Student — Assignment detail & submissions (`/student/assignments/{id}`)

Reached from the Assignments table on the Class detail page ([02 §2.5](02-classes-and-enrollment.md#25-student--my-classes--class-detail)) — every row action lands here.

```
+------------------------------------------------------------+
| < Back to Class                                               |
| Homework 1                            [Chưa nộp]              |
| Hạn nộp 2026-08-15 20:00 · Còn 3 ngày                         |
| description text...                                            |
| View my result ->  (link, once graded)                        |
|                                                                |
| Submit a file                                                  |
| PDF or DOCX [ choose file... ]  homework_v4.pdf  (x)           |
| [ Nộp bài ]                                                    |
|                                                                |
| Submission history                                             |
| v3  2026-08-14 21:02  homework_v3.pdf   2.4 MB  [ Download ]   |
| v2  2026-08-13 18:40  homework_v2.pdf   2.1 MB  [ Download ]   |
| v1  2026-08-10 09:15  homework_v1.docx  0.9 MB  [ Download ]   |
+------------------------------------------------------------+
```
- Header shows the assignment's title, `learning_state` badge (`Chưa nộp` / `Đã nộp` / `Đã chấm` / `Đã đóng` — same labels as the Assignments table, [03 §2.2](03-assignments-and-rubrics.md#22-student--assignments-tab-studentclassesid)), `due_at` + `deadline_badge`, and description — the student never has to go back to the table to see what the task is.
- **No `Cancel` button.** There is exactly one way out — `< Back to Class`, which returns to `/student/classes/{class_id}` (Assignments tab). A second button that also just leaves the page and also writes nothing is dead weight. Two things replace it:
  - `(x)` next to the chosen filename clears the file selection without leaving the page — the only "cancel" a student actually wants mid-form.
  - Leaving with a file chosen but not uploaded (Back, or browser navigation) triggers a confirm: "Bạn chưa nộp bài, thoát?".
- Nothing on this screen ever un-submits. There is no "huỷ bài đã nộp": correcting a submission means uploading again, which creates a new version, and the teacher only ever sees the latest one.
- The "Submit a file" block is hidden entirely when `learning_state` is `GRADED` or `CLOSED`; the `closure_reason` / "Đã chấm, không thể nộp lại" message takes its place. Submission history stays visible in every state.
- `Nộp bài` stays disabled until a file is chosen. While the request is in flight it reads `Đang nộp…` and stays disabled — the server's enrollment lock already serialises a double-submit, but without this the student gets two versions from one impatient double-click and no signal that anything is happening. At 25 MB the upload is seconds, so a plain busy button is enough; **no progress bar** — a bar that jumps 0 → 100 in one step is noise.
- The browser checks extension and size **before** starting the upload and refuses inline ("Chỉ nhận file PDF hoặc DOCX." / "File vượt quá 25 MB."). Sending 25 MB up a school connection only to be told the extension was wrong is the one failure the client can trivially prevent. The server re-checks regardless ([§5](#5-key-functions--rules)) — the client check is courtesy, not enforcement.
- On failure the chosen file is kept so the student doesn't re-pick it, and the error shows inline above the button: `400` re-enables `Nộp bài` (fix the file, try again), `422` replaces the whole block with the closure message (retrying is pointless).
- **After a successful submit** the page stays put and updates in place: the new version is prepended to Submission history, the `learning_state` badge flips to `Đã nộp`, the file input clears, and an inline "Đã nộp bài lúc HH:MM" confirms it. No redirect, no modal — the student's next question is "did it go through, and is it the right file", and the history row answers both.
- **No note / comment field.** A note would only ever be read by the teacher, and the teacher's view is deliberately file-only ([§2.2](#22-teacher--assignment-submissions-teacherassignmentsid)) — so a note is a box the student types into and nobody opens. Anything the student needs to say about the work belongs in the work.
- Each history row shows the file's `size`. It's the student's only way to catch a 0-byte or truncated upload before the deadline, and it costs one column.
- **Empty state** (never submitted): the history block is replaced by "Bạn chưa nộp bài nào." — the `Submit a file` block above it stays, so the page still has exactly one obvious action. When the assignment is also closed/graded and there's no submission, both blocks collapse to the `closure_reason` line alone.

### 2.2 Teacher — Assignment submissions (`/teacher/assignments/{id}`)

The teacher's single page per assignment — detail *and* submissions. There is no separate "view assignment" screen; the Assignments table ([03 §2.1](03-assignments-and-rubrics.md#21-teacher--assignments-tab-teacherclassesidtabassignments)) links here with one `Xem` action.

```
+------------------------------------------------------------+
| < Back to Class                                               |
| Homework 1                                    [Đang mở]       |
| Hạn nộp 2026-08-15 20:00 · Còn 3 ngày                         |
| description text...                                            |
| Rubric: Correctness 40 / Code quality 30 / Docs 30            |
| [ Sửa ] [ Sửa rubric ]     <- both disabled once due_at passed |
|                                                                |
| Bài nộp  12/24            (sorted by name, one file per student)|
| Nguyen Van A   homework_v3.pdf   2026-08-14 21:02  [Tải] [Chấm]|
| Tran Thi B     homework_v1.pdf   2026-08-11 08:20  [Tải]  82   |
| Le Van C       chưa nộp                                        |
| Pham Thi D     essay.docx  2026-08-12 10:05  đã tắt [Tải][Chấm]|
+------------------------------------------------------------+
```
- **No version column, no version number, no history link.** For the teacher a student has exactly one bài nộp — the latest file. `original_filename` may happen to contain "v3" because the student named it that way; that's the student's text, not a system-exposed version.
- The submitted-at timestamp replaces the version column: it's what a teacher actually acts on (late-ish, just-in-time, long done), whereas "v3" only tells them how many times the student fumbled.
- Students who haven't submitted are listed too, greyed with `chưa nộp` — otherwise a teacher can't tell 12/24 from the list alone.
- **Sorted by student name**, one stable order for everyone, submitted and not. Not by submit time: a list that reshuffles every time someone uploads is unusable for "đã chấm tới đâu rồi", and the teacher's mental index of a class is the name list.
- `12/24` = students who have submitted / students **currently enrolled**. Both numbers come from one response ([§3.1](#31-the-teacher-list-is-roster-shaped)), so a student unenrolled after submitting drops out of the list and out of both counts — same rule as the gradebook ([06 §6](06-gradebook.md#6-edge-cases)). Their `Submission` rows are kept for audit, just not surfaced here.
- A student whose **account was disabled** after enrolling stays on this list, tagged `đã tắt` ([02 §6](02-classes-and-enrollment.md#6-edge-cases)), and still counts in both halves of `12/24`. If they submitted, `[Tải]` and `[Chấm]` both still work: the work was handed in while the account was active, and refusing to grade it would punish the student for an admin action. Soft-deleted students disappear entirely, like unenrolled ones.
- Rows where `student_name` is empty fall back to `Student {id}` — same string the download filename uses ([§5.3](#53-download-filename)), so the two never disagree.
- **Empty state** (0/24, nobody submitted): the roster still renders in full, every row `chưa nộp`. No "no submissions yet" placeholder — the list of who owes work *is* the useful content, and an empty-state card would hide it.
- `[Chấm]` goes to `/teacher/assignments/{id}/grade/{submissionId}` ([05 §2.1](05-grading-and-results.md#21-teacher--grade-submission-teacherassignmentsidgradesubmissionid)). The teacher gets the submission's `id` — it's needed to download and to grade — just never its `version`.
- Already-graded rows show the score in place of `[Chấm]`; grading is one-way ([05](05-grading-and-results.md)).
- `Sửa` / `Sửa rubric` follow the expiry rules in [03 §5](03-assignments-and-rubrics.md#5-key-functions--rules) — both go dead the moment `due_at` passes, `due_at` itself included. The deadline can only be moved while the assignment is still open.

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/assignments/{id}/submissions` | Teacher (own), Student (own) | **Teacher caller: one row per currently-enrolled student, not one row per submission** — see [§3.1](#31-the-teacher-list-is-roster-shaped). Sorted by student name, unpaginated, `version` omitted. Student caller: their own versions, newest first |
| POST | `/api/assignments/{id}/submissions` | Enrolled Student | `multipart/form-data`: `file`. `400` on file validation (type/size/missing), `422` on business rules (already graded, window closed) — see [§3.2](#32-upload-failure-codes) |
| GET | `/api/submissions/{id}` | Owning Teacher (latest only) or owning Student | Older versions return `404` for a teacher — an old `id` is not a permission error, it simply doesn't exist for them |
| GET | `/api/submissions/{id}/download` | Owning Teacher (latest only) or owning Student | Same latest-only rule as the detail endpoint — a teacher cannot download an older version either. Streams the file with the stored `content_type`; re-checks authorization on every request — the storage path itself is never a public URL. Download filename differs per role, see [§5.3](#53-download-filename) |

### 3.1 The teacher list is roster-shaped

The teacher's screen ([§2.2](#22-teacher--assignment-submissions-teacherassignmentsid)) shows *every* enrolled student — including the ones who submitted nothing — sorted by name. A literal list of `Submission` rows can't produce that: it has no row for a non-submitter and no name to sort by. Rather than have the frontend fetch the roster from `/api/classes/{id}/students` ([02 §3](02-classes-and-enrollment.md#3-api)) and join it client-side against a second call — two paginations to reconcile, and a roster page size of 10 that has nothing to do with this screen — the server does the join:

```
GET /api/assignments/{id}/submissions   (teacher caller)
[
  { student_id, student_name, is_active, submission: { id, original_filename, size, created_at }, graded, score },
  { student_id, student_name, is_active, submission: null, graded: false, score: null },
  ...
]
```

- One row per **currently enrolled** student; `submission` is the latest one or `null`. This is what makes `12/24` ([§2.2](#22-teacher--assignment-submissions-teacherassignmentsid)) a count over a single response instead of an arithmetic guess across two.
- **Unpaginated**, sorted by `student_name`. A teacher grading a class needs to see who is missing, and a missing student on page 3 is a missing student nobody chases. Class sizes are tens, not thousands. `ponytail:` if a Class ever exceeds a few hundred students, paginate this endpoint then — not before.
- The path stays `/submissions` because that is what the screen is about; the roster is the axis it's reported along.

### 3.2 Upload failure codes

`400` means "this file is wrong, pick another one" — the student can retry immediately. `422` means "submission is over" — retrying is pointless, and the UI removes the form rather than re-enabling it.

| Status | Cause | Message |
|---|---|---|
| `400` | No file in the request | "Chưa chọn file." |
| `400` | Extension or sniffed MIME outside `.pdf`/`.docx` | "Chỉ nhận file PDF hoặc DOCX." |
| `400` | Over 25 MB | "File vượt quá 25 MB." |
| `413` | Over the reverse proxy's body limit — never reaches Django | Frontend maps it to the same message as the `400` size case; a student must not see a raw proxy error page |
| `422` | Already graded | `GRADED_MESSAGE` |
| `422` | Deadline or Class window closed | `CLOSED_MESSAGE` |
| `404` | No longer enrolled | — |

## 4. DB

**`submissions`**

| Field | Notes |
|---|---|
| `assignment_id`, `student_id`, `version` | unique together; `version` increments per (assignment, student), starting at 1 |
| `file_path` | storage-relative path (UUID-named on disk, `original_filename` kept separately for display/download) |
| `original_filename` | as uploaded; shown in both lists and used to build the download filename ([§5.3](#53-download-filename)) |
| `content_type` | validated on upload, then replayed as the `Content-Type` header on download — the file on disk is UUID-named and extensionless, so this is the only record of what it is |
| `size` | bytes; shown in the student's history so a 0-byte or truncated upload is visible before the deadline |
| `created_at` | |
| ordering | `-version` (latest first) |

## 5. Key functions / rules

- `can_submit(assignment)` — `is_open(assignment.classroom) and now < assignment.due_at`, i.e. `classroom.is_active and classroom.starts_at <= now < classroom.ends_at and now < due_at`. It reuses `assignments.is_open` ([03 §5](03-assignments-and-rubrics.md#5-key-functions--rules)) rather than restating the window, and adds only the assignment's own deadline — the same `is_active` note applies: `scoped_classes` normally 404s first, the term is kept so there is one window rule, not two.
- `create_submission(...)` (`submissions/services.py`) is the whole write path, and it's deliberately defensive:
  1. Locks the student's `Enrollment` row for this Class (`select_for_update`, or an `UPDATE` fallback on SQLite) — confirms enrollment still holds and serializes concurrent submits from the same student.
  2. Re-fetches the `Assignment` fresh inside the transaction (avoids acting on stale `due_at`/Class data).
  3. Re-checks `can_submit` and "not already graded" *after* acquiring the lock, not just at the view layer.
  4. Saves the file to storage first, then creates the `Submission` row; if anything after the file save fails, the stored file is deleted (no orphan files).
  5. Retries up to 3 times with backoff on SQLite's "database is locked" `OperationalError` — noted in code as a `ponytail:` shortcut (SQLite-wide write lock); a production DB with real row locking wouldn't need this.
- Version numbering: `(latest.version if latest else 0) + 1`, computed inside the same locked transaction as the insert.
- File validation (type allow-list `.pdf`/`.docx`, MIME sniff, size ≤ **25 MB**) happens in `SubmissionUploadSerializer` before `create_submission` is ever called.
- **25 MB is a per-file limit on a single upload**, not a per-student or cumulative budget — a student who submits five versions occupies up to 125 MB, and that's allowed. There is no storage quota anywhere in the system today; keeping every version ([§5.1](#51-why-a-re-upload-adds-a-row-instead-of-replacing-the-file)) is affordable precisely because a single file is capped this low. A homework PDF or DOCX that exceeds 25 MB is a scanning-settings problem, not a submission problem.
- The limit has to hold in three places or it doesn't hold at all: the browser checks it before starting the upload ([§2.1](#21-student--assignment-detail--submissions-studentassignmentsid)), the serializer re-checks it server-side, and the reverse proxy's body limit (nginx `client_max_body_size`, default **1 MB**) must be raised past 25 MB — otherwise the proxy returns a bare `413` and Django never sees the request. Django's own `FILE_UPLOAD_MAX_MEMORY_SIZE` needs no change; it only decides when an upload spools to a temp file instead of memory.
- A successful submit writes an audit record with `action="submission.created"` ([08 §4](08-audit-log.md#4-db)), inside the same transaction as the row insert.

### 5.1 Why a re-upload adds a row instead of replacing the file

The teacher only ever sees one file, so "just overwrite the old one" looks like the simpler design. It isn't — overwrite is a destructive write on the one artifact the whole course is graded on:

- **A failed re-upload must not cost the student the file they already had.** Insert-then-point-forward means a broken upload at 19:58 leaves v3 intact and submittable. Delete-then-write means the student is left with nothing, minutes before the deadline, through no fault of their own.
- **Grading anchors to a specific `submission_id`, not to "whatever is current".** The teacher downloads a file, reads it, then submits a score. With immutable rows the grade provably attaches to the bytes they read, and a student upload in between is caught as `422 NOT_LATEST_MESSAGE` ([05 §5](05-grading-and-results.md#5-key-functions--rules)). With overwrite, that race is silent: the score lands on a file the teacher never opened.
- **Disputes are about timestamps.** "Em nộp đúng hạn rồi" is answerable only if the on-time submission still exists with its own `created_at`. Overwrite replaces that timestamp with the late one.

Cost of keeping them: one row and one file per re-upload, invisible to the teacher. Cheap enough that pruning is a retention decision for later, not a reason to overwrite now.

### 5.2 The two stops, and only these two

A student can submit until exactly one of these happens, whichever comes first — nothing else blocks and nothing re-opens:

1. **`due_at` passes** (or the Class's `starts_at`/`ends_at` window closes) → `422 CLOSED_MESSAGE`.
2. **The teacher grades it** → `422 GRADED_MESSAGE`, even if the deadline is still days away.

Both are terminal. There is no re-open, no extension for one student, no "nộp bù" — moving `due_at` while the assignment is still open is the only lever, and it applies to the whole class ([03 §5](03-assignments-and-rubrics.md#5-key-functions--rules)).

### 5.3 Download filename

`original_filename` is the student's own text, so in a class of 24 it is routinely the same string 24 times. Downloading the roster one by one then lands `homework.pdf`, `homework(1).pdf`, `homework(2).pdf` in the teacher's Downloads folder — the one place the mapping back to a student is lost, and exactly where a misgraded paper comes from.

`Content-Disposition` therefore differs by role:

| Caller | Filename served |
|---|---|
| Student (own file) | `original_filename` unchanged — they already know whose it is |
| Teacher | `{student_name}_{original_filename}`, e.g. `Nguyen Van A_homework.pdf` |

The prefix is built from the student's name with `/`, `\`, and control characters stripped, and the whole name is truncated so the result stays a legal filename on Windows and macOS. When `student_name` is empty or null it falls back to `Student {id}` — the same fallback the lists use, and still unique, which is the only property that matters here. Two students with identical names still collide — the browser's `(1)` suffix is an acceptable floor for that, and the roster is the fix, not the filename.

## 6. Edge cases

- Second upload attempt after a teacher has already graded (even if the deadline hasn't passed) → `422` `GRADED_MESSAGE`.
- Upload attempt exactly at/after `due_at`, or after the Class's `ends_at` → `422` `CLOSED_MESSAGE`.
- Concurrent double-submit from the same student (e.g. two browser tabs) → serialized by the enrollment row lock; the second request either gets the next version cleanly or hits the same business-rule checks post-lock.
- Enrollment removed between page load and upload → `404` (`Enrollment.DoesNotExist` inside the lock → `Http404`).
- Teacher holds a stale page and clicks `Tải` on a submission the student has since replaced → `404` (that id is no longer the latest). The list refetch on the assignment page is the fix; the teacher never had a route to the old file to begin with.
- File over 25 MB → caught by the browser before the upload starts; if it gets past (proxy misconfigured, direct API call) the serializer returns `400`, and a proxy-level rejection surfaces as `413` mapped to the same message ([§3.2](#32-upload-failure-codes)).
- File renamed to `.pdf` but not actually a PDF → rejected by the MIME sniff, `400`, not the extension check alone.
- Student double-clicks `Nộp bài` → the button is disabled for the duration of the request, and the enrollment lock serialises anything that still gets through; worst case is one extra version, never a corrupted one.
- Student's account disabled between submitting and grading → the row stays, tagged `đã tắt`, and remains gradeable.
- Teacher opens the page while a student is mid-upload → that student simply shows `chưa nộp` until the row commits; there is no partial or "đang nộp" state visible to the teacher.
