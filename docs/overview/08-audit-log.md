# Feature: Audit Log

Part of [00-system-overview](00-system-overview.md). Backend app: `audit/`. Frontend: `AuditLogPage`.

## 1. Purpose

Append-only trail of the system's significant writes (accounts, Classes, enrollment, assignments, rubrics, submissions, grading). Admin-only visibility. Exists for accountability/debugging, not for undo — and coverage is a list, not a guarantee: see [§5.1](#51-what-is-not-audited) for what it deliberately (and in one case accidentally) does not record.

## 2. Screens (ASCII)

### 2.1 Admin — Audit log (`/admin/audit-logs`)

```
+-----------------------------------------------------------------------------------------------+
| Audit log                                                                                     |
| Review account and learning activity.                                                         |
|                                                                                               |
| Time              Actor                    Action              Target                         |
| ----------------  -----------------------  ------------------  ------------------------------ |
| 2026-07-29 10:15  Admin - Le Quoc Bao      Created account     Student Tran Minh Anh          |
| 2026-07-29 10:20  Admin - Le Quoc Bao      Created class       Web Development K18A           |
| 2026-07-29 11:02  Teacher - Pham Thu Hoa   Created assignment  Lab 3 - Responsive Layout      |
| 2026-07-29 14:40  Student - Tran Minh Anh  Submitted work      Lab 3 - Responsive Layout      |
| 2026-07-29 15:10  Teacher - Pham Thu Hoa   Recorded grade      Lab 3 - Tran Minh Anh 85/100   |
|                                                                                               |
|                                        [ < ] 1 2 3 ... 12 [ > ]                               |
+-----------------------------------------------------------------------------------------------+
```

The screen is the readable rendering, not what the DB holds. Each row stores a dotted `action` code and a numeric `target_id` ([§4](#4-db)); the UI maps the code to a sentence and resolves the ID to the row's name:

| Stored `action` | Rendered action | Target rendered from `target_type` + `target_id` |
|---|---|---|
| `account.created` | Created account | User's full name + role |
| `account.updated` | Updated account | User's full name + role |
| `account.self_updated` | Updated own profile | User's full name + role |
| `account.deactivated` | Disabled account | User's full name + role |
| `account.reactivated` | Enabled account | User's full name + role |
| `account.deleted` | Deleted account | User's full name + role |
| `account.password_changed` | Changed own password | User's full name + role |
| `account.password_set` | Set account password | User's full name + role |
| `class.created` | Created class | Class name |
| `class.updated` | Updated class | Class name |
| `class.status_changed` | Enabled / Disabled class | Class name |
| `class.reopened` | Extended class end date | Class name |
| `class.teacher_changed` | Reassigned teacher | Class name |
| `enrollment.created` | Enrolled student | Class name + student |
| `enrollment.replaced` | Replaced roster | Class name |
| `enrollment.removed` | Removed student | Class name + student |
| `assignment.created` | Created assignment | Assignment title |
| `assignment.updated` | Updated assignment | Assignment title |
| `assignment.rubric.updated` | Updated rubric | Assignment title |
| `submission.created` | Submitted work | Assignment title of the submission |
| `grade.created` | Recorded grade | Assignment title + student + score |
| `class_resource.created` | Added resource | Resource title |

The target column is **not** resolved by the frontend. `GET /api/audit-logs` returns a ready-made `target_label` string per row, built server-side by `audit/labels.py` in a fixed number of batched queries (one per referenced table) regardless of how long the log is — the alternative was either an N+1 in the serializer or three extra list endpoints the frontend would have to join by hand. A row whose target can no longer be resolved gets `""`, and the UI shows the raw `target_type #target_id` instead of a blank cell.

Two rows read oddly on purpose. `class.status_changed` renders as **Enabled** or **Disabled** depending on the `is_active` value in `metadata` — one action code, two sentences, because a separate `class.disabled` / `class.enabled` pair would be two codes carrying one bit. `enrollment.replaced` has no student in its target: a roster `PUT` ([02 §3](02-classes-and-enrollment.md#3-api)) is one write covering many students, and `metadata` carries `{class_id, student_ids: [...]}` — the resulting roster as a list of IDs, not names, because strings don't survive the scrubber ([§5](#5-key-functions--rules)). To find out *who*, read the `enrollment.created` / `enrollment.removed` rows written alongside it.

Any `action` the UI doesn't recognise renders as the raw dotted code rather than being hidden — a log that silently drops rows it doesn't understand is worse than an ugly one.

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/audit-logs` | Admin only | Paginated list, newest first (`-created_at, -id`); `?page=N`, 10 rows/page |

The table is append-only and never pruned, so the list is paginated like every other list in the app (`{count, next, previous, results}`, 10 per page) rather than shipping the whole log — the alternative gets slower every day it runs. `audit/labels.py` resolves labels for the current page only, so the batched-query count stays flat no matter how long the log grows. A `?page=` past the end is a 404, the DRF default.

## 4. DB

**`audit_logs`**

| Field | Notes |
|---|---|
| `actor_id` | FK → users, `PROTECT` (can't delete a user who has audit history) |
| `action` | dotted string; the full set written today is below |
| `target_type` | Django model label (`app_label.ModelName`) |
| `target_id` | PK of the affected row |
| `metadata` | JSON, scrubbed (see below) |
| `created_at` | |

Append-only is enforced at three levels: `AuditLogQuerySet.update()`/`.delete()` raise `RuntimeError`, `AuditLog.save()` raises if `self.pk` is already set (no updates to existing rows), and `AuditLog.delete()` raises unconditionally.

**Actions written today**, by feature:

| Feature | Actions |
|---|---|
| Accounts ([01](01-auth-and-accounts.md)) | `account.created`, `account.updated`, `account.self_updated`, `account.deactivated`, `account.reactivated`, `account.deleted`, `account.password_changed`, `account.password_set` |
| Classes ([02](02-classes-and-enrollment.md)) | `class.created`, `class.updated`, `class.status_changed`, `class.reopened`, `class.teacher_changed`, `enrollment.created`, `enrollment.replaced`, `enrollment.removed` |
| Assignments ([03](03-assignments-and-rubrics.md)) | `assignment.created`, `assignment.updated`, `assignment.rubric.updated` |
| Submissions ([04](04-submissions.md)) | `submission.created` |
| Grading ([05](05-grading-and-results.md)) | `grade.created` |
| Class resources ([07](07-notifications-and-resources.md)) | `class_resource.created` |

**Nothing in the domain is hard-deleted.** `account.deleted` is a *soft* delete — it records `is_deleted = true` ([01 §5](01-auth-and-accounts.md#5-key-functions--rules)), the `users` row and everything hanging off it survive. Everywhere else there is no deletion at all to record: Classes are never deleted ([02 §1](02-classes-and-enrollment.md#1-purpose)), enrollments are removed as a row but their `Submission`s and `Grade`s stay ([04 §2.2](04-submissions.md#22-teacher--assignment-submissions-teacherassignmentsid), [06 §6](06-gradebook.md#6-edge-cases)), submissions accumulate versions instead of overwriting ([04 §5.1](04-submissions.md#51-why-a-re-upload-adds-a-row-instead-of-replacing-the-file)), and grades are immutable ([05 §5.2](05-grading-and-results.md#52-grading-is-a-one-way-door-in-three-directions)). So the log never has to answer "what was in the row that's gone" — the row isn't gone.

Two account actions are easy to confuse: `account.password_changed` is the user changing their own password ([01 §2.2](01-auth-and-accounts.md#22-change-password-forced-change-password), `POST /api/auth/change-password`); `account.password_set` is an admin setting someone else's directly (`POST /api/users/{id}/reset-password`). The self-service email-link reset writes `account.password_changed` too — the actor is the user either way. Neither stores the password, old or new ([§5](#5-key-functions--rules)).

## 5. Key functions / rules

- `write_audit(*, actor, action, target, metadata)` — the only way audit rows get created; every feature's mutating view calls this inside its own `transaction.atomic()` block, so the domain write and its audit row commit or roll back together.
- `safe_metadata(metadata)` → `_safe_value(...)` recursively scrubs the metadata dict before it's stored:
  - Drops any dict key containing `password`, `hash`, `token`, `secret`, `authorization`, `jwt`, `access`, `refresh`, `file`, `path`, `storage`, `upload`, `content`, `bytes`, `blob`, `data`.
  - Drops any value that is `bytes`, or a string that looks like an absolute/relative filesystem path (contains `/` or `\`) — belt-and-suspenders against a raw file path or content sneaking into metadata even under an innocuous key name.
  - **All plain strings are dropped**, not just path-like ones (`_safe_value` returns `_SKIP` for any `str`) — so metadata ends up holding only numbers, booleans, lists, and nested dicts of the same. Callers pass structured data (IDs, counts, booleans) rather than free text for this reason.
- This is why every feature doc's "audit write" mentions IDs/counts as metadata, not human-readable strings — check `_safe_value` before adding a new string field to any `write_audit(metadata=...)` call, or it will silently vanish from the stored row.

### 5.1 What is *not* audited

- **Reads and downloads.** `GET /api/submissions/{id}/download` re-authorizes on every request ([04 §3](04-submissions.md#3-api)) but records nothing, so there is no answer to "which teacher opened whose file, when". Deliberate: the trail is for writes, and a download row per file in a 30-student class is noise that would bury the writes. Add it only if a real access-review requirement shows up.
- **Notification fan-out and reads** ([07](07-notifications-and-resources.md)) — the `Notification` rows *are* the record.
- **Class resource edits and deletes.** Creation *is* audited — `ClassResourcesView.post` writes `class_resource.created` inside the same transaction as the row and the notification fan-out ([§4](#4-db)). `ClassResourceDetailView.patch` / `.delete` still write nothing, so a teacher can retitle or remove a document with no trace of who or when. `class_resource.updated` / `.deleted` inside the existing transactions would close that; not done yet. Flagged in [07 §2.3](07-notifications-and-resources.md#23-teacher-side-resource-management) too.

### 5.2 The trail proves *that*, rarely *what*

Metadata carries IDs — `assignment.updated` stores `{class_id, assignment_id}` and nothing else. Combined with the string scrubber, this means the log records that a write happened and who did it, not what the values were before and after. Two places where that matters, both worth knowing before someone leans on the log to settle an argument:

- **A moved `due_at`.** [04 §5.1](04-submissions.md#51-why-a-re-upload-adds-a-row-instead-of-replacing-the-file) rests on disputes being answerable from timestamps, but that argument is about `Submission.created_at` — immutable rows the student can see. The *deadline's* own history is not reconstructable: `assignment.updated` says the teacher changed something at 14:02, not that they pulled the deadline in by two days. A student claiming "hạn nộp bị đổi" can be confirmed only up to "an edit happened".
- **A score.** `grade.created` is enough here, because grades are one-way ([05 §5.2](05-grading-and-results.md#52-grading-is-a-one-way-door-in-three-directions)) — there is no second row to compare against, and `grades` itself holds the value permanently.

Fixing the first one means passing before/after values as *numbers* (epoch seconds, not ISO strings — strings are dropped) into `metadata`. Not done today; noted so nobody discovers it mid-dispute.

## 6. Edge cases

- Passing a raw request body or a serializer's `.validated_data` straight into `metadata` is unsafe by default — string values will simply disappear, which can look like a bug ("why is `email` missing from this audit row?") but is the scrubber doing its job.
- Attempting to delete a `User` who has audit rows (`actor_id`) fails at the DB level (`PROTECT`) — deactivation (`is_active=false`), not deletion, is the only supported account-removal path (see [01-auth-and-accounts](01-auth-and-accounts.md)).
- A student unenrolled from a Class disappears from the teacher's submissions list and the gradebook ([04 §2.2](04-submissions.md#22-teacher--assignment-submissions-teacherassignmentsid), [06 §6](06-gradebook.md#6-edge-cases)), but their `submission.created` and `grade.created` rows stay here. The audit log is the only screen where that work is still visible — which is the point of keeping the rows.
- `submission.created` is written inside the same transaction as the `Submission` insert and the file save ([04 §5](04-submissions.md#5-key-functions--rules)), so a stored file with no audit row (or the reverse) is not a state the system can reach. Same for `grade.created` inside `grade_submission`.
- The log records `submission.created` per **version**, so an audit row count for one (assignment, student) can exceed the one submission the teacher ever sees. Versions are student-side only ([04 §1](04-submissions.md#1-purpose)); the audit log is the other place they surface, and it's Admin-only.
- `enrollment.removed` writes its audit row and *then* deletes the `Enrollment`, so its `target_id` points at a row that no longer exists the moment the transaction commits. Its label is therefore built from `metadata.class_id` / `metadata.student_id`, never from `target_id` — which is why the `enrollment.*` family's metadata cannot be thinned down to bare counts: it is the only surviving pointer to who was removed from where.
- A `submission.created` row's `target_id` may point at a version no teacher can fetch any more (`404` on non-latest, [04 §3](04-submissions.md#3-api)). The row is a historical fact, not a live link.
