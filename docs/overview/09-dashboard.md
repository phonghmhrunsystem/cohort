# Feature: Dashboard

Part of [00-system-overview](00-system-overview.md). Backend app: `dashboard/`. Frontend: `DashboardPage` + three role views under `pages/dashboard/`.

## 1. Purpose

The screen everyone lands on after signing in (`/` redirects to `/dashboard`). It is **read-only** and it shows three different things: an Admin sees the size and health of the system, a Teacher sees what is waiting for them, a Student sees what is due. One endpoint serves all three — the payload changes shape according to the **caller's** role, never according to a parameter.

## 2. Screens (ASCII)

### 2.1 Admin — `/dashboard`

```
+---------------------------------------------------------------------------------------------+
| Tổng quan                                                                                   |
|                                                                                             |
| Tài khoản                                                                                   |
| +----------------+ +----------------+ +----------------+                                    |
| | 2              | | 5              | | 84             |                                    |
| | Quản trị viên  | | Giảng viên     | | Học viên       |                                    |
| +----------------+ +----------------+ +----------------+                                    |
|                                                                                             |
| Lớp học                                                                                     |
| +------------+ +---------------+ +----------------+ +-----------+                           |
| | 3          | | 1             | | 7              | | 2         |                           |
| | Đang chạy  | | Sắp bắt đầu   | | Đã kết thúc    | | Đã tắt    |                           |
| +------------+ +---------------+ +----------------+ +-----------+                           |
|                                                                                             |
| Hoạt động gần đây                                                                           |
| Thời gian         Người thực hiện    Hành động        Đối tượng                             |
| ----------------  -----------------  ---------------  ------------------------------        |
| 2026-08-03 10:15  Le Quoc Bao        Tạo lớp          Web Development K18A                  |
| (empty) Chưa có hoạt động nào.                                                              |
+---------------------------------------------------------------------------------------------+
```

### 2.2 Teacher — `/dashboard`

```
+---------------------------------------------------------------------------------------------+
| Tổng quan                                                                                   |
| +-------------+ +------------+ +---------------+ +----------------+ +------------+          |
| | 4           | | 2          | | 6             | | 11             | | 63         |          |
| | Lớp của tôi | | Đang chạy  | | Bài đang mở   | | Bài chờ chấm   | | Học viên   |          |
| +-------------+ +------------+ +---------------+ +----------------+ +------------+          |
|                                                                                             |
| Chờ chấm                                                                                    |
| Học viên        Bài tập     Lớp                     Nộp lúc              (link)             |
| ---------------  ---------  ---------------------  ------------------   -------            |
| Tran Minh Anh    Lab 3      Web Development K18A    2026-08-03 09:40     Chấm              |
| (empty) Không còn bài nào chờ chấm.                                                         |
|                                                                                             |
| Sắp tới hạn                                                                                 |
| Bài tập   Lớp                    Hạn nộp             Đã nộp                                 |
| --------  --------------------   ------------------  --------                               |
| Lab 4     Web Development K18A   2026-08-05 17:00    12/30                                  |
| (empty) Không có bài nào tới hạn trong 7 ngày tới.                                           |
+---------------------------------------------------------------------------------------------+
```

### 2.3 Student — `/dashboard`

```
+---------------------------------------------------------------------------------------------+
| Tổng quan                                                                                   |
| +----------------+ +------------------+ +-----------------+ +---------------------+         |
| | 2              | | 3                | | 8               | | 82.5                |         |
| | Lớp đang học   | | Bài chưa nộp     | | Bài đã chấm     | | Điểm trung bình     |         |
| +----------------+ +------------------+ +-----------------+ +---------------------+         |
|                                                                                             |
| Cần nộp                                                                                     |
| Bài tập   Lớp                    Hạn nộp                                                    |
| --------  --------------------   ------------------                                         |
| Lab 4     Web Development K18A   2026-08-05 17:00                                           |
| (empty) Không có bài nào cần nộp.                                                            |
|                                                                                             |
| Điểm gần đây                                                                                |
| Bài tập   Lớp                    Điểm     Chấm lúc                                          |
| --------  --------------------   -------  ------------------                                |
| Lab 3     Web Development K18A   85/100   2026-08-02 15:10                                  |
| (empty) Chưa có điểm nào.                                                                    |
+---------------------------------------------------------------------------------------------+
```

Every row in `Chờ chấm` / `Sắp tới hạn` / `Cần nộp` links to a screen that already exists (the grading page, the teacher assignment page, the student assignment page). The dashboard builds no new detail screen of its own.

`Điểm trung bình` shows an em dash (`—`), not `0`, when nothing has been graded yet — `average_score` is `null` in that case, and a zero would read as a failing grade.

## 3. API

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/dashboard` | Any signed-in role | Payload shape follows the **caller's** `role`. No query parameters are read — a Teacher cannot ask for the Admin payload. `401` anonymous, `403` while `must_change_password`; there is no `404`. |

The `role` field is echoed inside the payload so the response describes its own shape; it is a copy of `/api/auth/me`, not a second source of truth.

## 4. DB

**No tables.** The `dashboard` app owns no model and has no `migrations/` directory; it only reads `users`, `classes`, `enrollments`, `assignments`, `submissions`, `assignment_grades`, `grades` and `audit_logs`. If `makemigrations` ever produces something for this app, a model has been added in the wrong place.

## 5. Key functions / rules

1. **Scope is enforced by the server, and by exactly one function.** All three payloads start from `classes.views.scoped_classes(user)` — Admin sees every Class, a Teacher only their own, a Student only the ones they are enrolled in, and both of the latter are already filtered to `is_active=True`. The `dashboard` app writes no scope filter of its own; a second copy of that rule would drift from the first.
2. **The class window is written twice, on purpose, and pinned by a test.** `classes.views.is_open(class_)` is the in-memory check (`is_active and starts_at <= now < ends_at`); `classes.views.open_class_q(now)` is the same rule as a `Q` so it can live inside a `WHERE`. `is_open` was deliberately *not* rewritten in terms of a query — that would add a round trip to its four existing call sites. `classes.tests.test_classes.OpenClassWindowTests` is the only thing keeping the two in agreement; do not delete it.
3. **Query budget: ≤ 8 fixed queries per role**, independent of how many classes, assignments or students exist. Every number is computed by `aggregate()`/`annotate()`; no Python loop issues a query. `dashboard.tests.test_dashboard.QueryBudgetTests` builds two datasets of different sizes and asserts the query count does not change between them — measured at 2026-08-03: admin=3 (7 once the audit log touches all four label tables), teacher=7, student=6.
4. **The dashboard writes nothing.** No `write_audit`, no POST/PUT/DELETE, no model, no migration. Audit records writes, not reads ([08 §5.1](08-audit-log.md#51-what-is-not-audited)).
5. **Nothing here is data the role could not already reach** through an existing endpoint; the dashboard is an aggregation for convenience, not a new disclosure channel.

Fixed limits, all in `dashboard/services.py`:

| Constant | Value | Feeds |
|---|---|---|
| `_RECENT_AUDIT_LIMIT` | 5 | Admin `recent_audit` |
| `_PENDING_LIMIT` | 10 | Teacher `pending` |
| `_DUE_SOON_LIMIT` | 5 | Teacher `due_soon` |
| `_DUE_SOON_WINDOW` | 7 days | Teacher `due_soon` |
| `_TODO_LIMIT` | 10 | Student `todo` |
| `_RECENT_GRADES_LIMIT` | 5 | Student `recent_grades` |

## 6. Edge cases

- **Overdue work is excluded from `not_submitted` and `todo`.** There is no action left to take on it, and a "not submitted" card that can never return to zero is a card nobody reads. The overdue state is still visible in the existing class tab.
- **`pending_grading` counts (assignment, student) pairs, not submissions.** A student who resubmits three times is still one thing to grade, and `pending` shows only the newest version of each pair — the Teacher only ever grades the latest one ([04 §1](04-submissions.md)), so listing an old version would just invite a misclick.
- **`average_score` is `null`, never `0`, when nothing is graded.** The frontend renders `—`.
- **A Teacher's `students` card is a distinct head count.** Someone enrolled in two of that teacher's classes counts once: the card answers "how many people am I teaching", not "how many enrollment rows exist".
- **A disabled Class (`is_active=False`) disappears from every Teacher and Student number**, including work waiting to be graded inside it — it is invisible, not merely read-only ([00 §6.2](00-system-overview.md#6-cross-cutting-rules-apply-to-every-feature)). The Admin still counts it, under `classes.disabled`.
- **Disabled accounts still count**; only soft-deleted ones (`is_deleted=True`) drop out of `accounts.*`. A disabled account still exists and still needs managing.
- **The four Admin class buckets are mutually exclusive and sum to the total number of classes.** `disabled` is decided first and ignores dates entirely.
- **`recent_audit` carries the raw `action` plus a resolved `target_label`.** The frontend turns the code into a sentence with `lib/auditActions.ts` and falls back to printing the dotted code for anything it does not recognise. The order — `(-created_at, -id)` — is the same as `/api/audit-logs`, because two screens reading one table must tell one story. The dashboard payload omits `metadata`, so `class.status_changed` (whose sentence depends on `metadata.is_active`) renders with its default wording here; the full audit log page is the place to read it exactly.
