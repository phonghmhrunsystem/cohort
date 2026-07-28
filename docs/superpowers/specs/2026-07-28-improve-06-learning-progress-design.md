# Feature 06 — Student Learning Progress and Gradebook

## Goal

Turn the existing assignment list into a clear learning progress view and give
Teachers a practical single-Class gradebook.

## Student assignment state

The backend returns one server-authoritative state for each enrolled Student:

| State | Meaning | Primary UI |
| --- | --- | --- |
| `OPEN` | Class open, before deadline, not graded | `Nộp bài`; rubric and deadline visible. |
| `SUBMITTED` | Latest submission exists, not graded, before deadline | `Xem lịch sử nộp`; no duplicate primary upload action. |
| `GRADED` | Latest submission has grade | `Xem kết quả`; score, feedback, criterion scores, `Đã chấm`. |
| `CLOSED` | Deadline or Class end passed without grade | No submission action; clear closure reason. |

- Cards show deadline badges derived from existing time: `Còn hôm nay`, `Còn 1 ngày`, `Còn 3 ngày`, or `Đã hết hạn`. This is calculated on read; no scheduler or reminder job.
- Class header shows progress: number of graded assignments over total relevant
  assignments and the nearest open deadline.
- Submission history remains read-only and preserves past versions. The
  backend graded lock still rejects any attempted upload after grading.

## Teacher gradebook

- Teacher Class has a `Bảng điểm` tab listing enrolled Students and every
  assignment column/status: `Chưa nộp`, `Đã nộp`, `Đã chấm: {score}`.
- Filter by Student name and assignment status; never show a Student from a
  different Class.
- `GET /classes/{id}/gradebook` returns the complete, server-authorized rows.
- `GET /classes/{id}/gradebook.csv` returns UTF-8 CSV with display name, email,
  assignment titles, states, and score. It is a download only; no spreadsheet
  dependency and no grade mutation in CSV.

## Acceptance

- A graded student sees `GRADED` and cannot submit again through UI or direct
  API.
- Deadline/class end produces `CLOSED` consistently in the card and API.
- CSV contains only the current Teacher's Class roster and never passwords,
  tokens, storage paths, or private file names.
- Empty Class and no-assignment states remain explicit and usable at 320 px;
  the gradebook table may scroll horizontally.

## Out of scope

Scheduled reminders, calendar sync, charts, leaderboards, chat, AI feedback,
AI grading, grade appeals, and bulk grade edit/import.
