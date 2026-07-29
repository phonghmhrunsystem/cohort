# Feature: Audit Log

Part of [00-system-overview](00-system-overview.md). Backend app: `audit/`. Frontend: `AuditLogPage`.

## 1. Purpose

Append-only trail of every significant write in the system (accounts, Classes, enrollment, assignments, rubrics, submissions, grading). Admin-only visibility. Exists for accountability/debugging, not for undo.

## 2. Screens (ASCII)

### 2.1 Admin — Audit log (`/admin/audit-logs`)

```
+------------------------------------------------------------+
| Audit log                                                     |
| Review account and learning activity.                         |
|                                                                |
| 2026-07-29 10:15  admin@x.com    account.created      user#42 |
| 2026-07-29 10:20  teacher@x.com  class.created         class#7|
| 2026-07-29 11:02  teacher@x.com  assignment.created    asgn#19|
| 2026-07-29 14:40  student@x.com  submission.created    sub#88 |
| 2026-07-29 15:10  teacher@x.com  grade.created          grade#9|
+------------------------------------------------------------+
```

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/audit-logs` | Admin only | Full list, newest first (`-created_at, -id`) |

## 4. DB

**`audit_logs`**

| Field | Notes |
|---|---|
| `actor_id` | FK → users, `PROTECT` (can't delete a user who has audit history) |
| `action` | dotted string, e.g. `account.created`, `class.updated`, `enrollment.replaced`, `assignment.rubric.updated`, `submission.created`, `grade.created` |
| `target_type` | Django model label (`app_label.ModelName`) |
| `target_id` | PK of the affected row |
| `metadata` | JSON, scrubbed (see below) |
| `created_at` | |

Append-only is enforced at three levels: `AuditLogQuerySet.update()`/`.delete()` raise `RuntimeError`, `AuditLog.save()` raises if `self.pk` is already set (no updates to existing rows), and `AuditLog.delete()` raises unconditionally.

## 5. Key functions / rules

- `write_audit(*, actor, action, target, metadata)` — the only way audit rows get created; every feature's mutating view calls this inside its own `transaction.atomic()` block, so the domain write and its audit row commit or roll back together.
- `safe_metadata(metadata)` → `_safe_value(...)` recursively scrubs the metadata dict before it's stored:
  - Drops any dict key containing `password`, `hash`, `token`, `secret`, `authorization`, `jwt`, `access`, `refresh`, `file`, `path`, `storage`, `upload`, `content`, `bytes`, `blob`, `data`.
  - Drops any value that is `bytes`, or a string that looks like an absolute/relative filesystem path (contains `/` or `\`) — belt-and-suspenders against a raw file path or content sneaking into metadata even under an innocuous key name.
  - **All plain strings are dropped**, not just path-like ones (`_safe_value` returns `_SKIP` for any `str`) — so metadata ends up holding only numbers, booleans, lists, and nested dicts of the same. Callers pass structured data (IDs, counts, booleans) rather than free text for this reason.
- This is why every feature doc's "audit write" mentions IDs/counts as metadata, not human-readable strings — check `_safe_value` before adding a new string field to any `write_audit(metadata=...)` call, or it will silently vanish from the stored row.

## 6. Edge cases

- Passing a raw request body or a serializer's `.validated_data` straight into `metadata` is unsafe by default — string values will simply disappear, which can look like a bug ("why is `email` missing from this audit row?") but is the scrubber doing its job.
- Attempting to delete a `User` who has audit rows (`actor_id`) fails at the DB level (`PROTECT`) — deactivation (`is_active=false`), not deletion, is the only supported account-removal path (see [01-auth-and-accounts](01-auth-and-accounts.md)).
