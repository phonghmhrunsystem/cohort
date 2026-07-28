# Student Learning Progress and Gradebook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Student có trạng thái học tập rõ ràng và Teacher có gradebook/CSV cho đúng một Class.

**Architecture:** Một `assignment_learning_state()` server helper dùng chung cho Student card, Class progress và Gradebook. CSV dùng stdlib `csv`, download-only.

**Tech Stack:** Django, DRF, Python csv stdlib, React, TypeScript, Vitest.

## Global Constraints

- States chính xác: `OPEN`, `SUBMITTED`, `GRADED`, `CLOSED`; backend graded lock vẫn authority.
- Deadline badge tính khi read; không scheduler/reminder.
- Gradebook is assigned-Teacher-only; CSV never includes password/token/private filename/path.

---

### Task 1: Authoritative student assignment state

**Files:** Create `backend/assignments/services.py`; modify assignment/submission serializers/views/tests and frontend assignment/class pages/tests.

- [ ] **Step 1: Write tests for every state, deadline/class end, grade lock direct upload, deadline badge, class progress/nearest deadline.**

```python
self.assertEqual(response.data[0]["learning_state"], "GRADED")
response = self.student_client.post(upload_url, payload, format="multipart")
self.assertEqual(response.status_code, 422)
```

- [ ] **Step 2: Implement `assignment_learning_state(assignment, student, now)` from latest Submission + Grade and `deadline_badge`; reuse existing `can_submit` for upload behavior.**

- [ ] **Step 3: Extend student serializer with state/badge/reason and Class with progress; render cards: submit/history/result/no-action only from returned state.**

- [ ] **Step 4: Run `cd backend; python manage.py test assignments submissions grading classes -v 2` and `cd frontend; npm test; npm run build`; commit `feat: show student learning progress`.**

### Task 2: Gradebook API and CSV

**Files:** Modify `backend/classes/{serializers,views,urls}.py`, class tests.

**Produces:** `GET /classes/:id/gradebook`, `GET /classes/:id/gradebook.csv`.

- [ ] **Step 1: Write tests for owner access, cross-Teacher denial, empty state, full roster/status/score and UTF-8 private-safe CSV.**

```python
response = self.teacher_client.get(f"/api/classes/{self.classroom.id}/gradebook.csv")
self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
self.assertNotIn("file_path", response.content.decode())
```

- [ ] **Step 2: Query/prefetch roster, assignments, latest submissions and grades; compose all rows from Task 1 helper. Use `csv.writer` with UTF-8 BOM and `Họ tên,Email` headers.**

- [ ] **Step 3: Run `cd backend; python manage.py test classes assignments submissions grading -v 2`; commit `feat: add class gradebook API`.**

### Task 3: Teacher gradebook page and final proof

**Files:** Create `frontend/src/pages/TeacherGradebookPage.tsx` and test; modify `classes.ts`, `TeacherClassPage.tsx`, `main.tsx`, `styles.css`, README.

- [ ] **Step 1: Write UI tests for name/status filter, empty class/no assignment, download link and scroll only inside table wrapper.**

- [ ] **Step 2: Render Bảng điểm route/tab, filter returned rows in memory, link `.csv` download; do not add bulk edit/import.**

- [ ] **Step 3: Run full suite.**

```powershell
cd backend; python manage.py test -v 2
cd frontend; npm test
cd frontend; npm run build
```

- [ ] **Step 4: Inspect Student and Gradebook 320px + desktop; commit `test: verify learning progress and gradebook`.**

## Feature Gate

State in card/API agrees with upload lock; gradebook and CSV contain only the assigned Teacher Class.

