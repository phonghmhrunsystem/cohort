# Student Submissions and Teacher Grading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let enrolled Students submit versioned private work and view their results while Teachers grade the latest work only.

**Architecture:** Add one `submissions` app that owns uploaded file metadata, version allocation, grades, and authorized download. It queries cohort enrollment and assignment ownership instead of duplicating them; Student and Teacher pages are thin wrappers around the resulting APIs.

**Tech Stack:** Django, DRF multipart uploads, SQLite, local private files, React, TypeScript, Vitest.

## Global Constraints

- Accept DOC, DOCX, PDF, MP4, MOV only after extension and MIME validation; reject files over `MAX_UPLOAD_BYTES` before saving.
- File storage paths are private and never serialized; download has a separate authorization view.
- Enrolled Students can submit before the deadline until grading; versions strictly increase per assignment/student.
- Non-rubric score is integer 0–100; rubric total is calculated server-side.

---

### Task 1: Persist and validate submissions

**Files:**
- Create: `backend/submissions/__init__.py`, `backend/submissions/models.py`, `backend/submissions/serializers.py`, `backend/submissions/views.py`, `backend/submissions/urls.py`, `backend/submissions/migrations/__init__.py`, `backend/submissions/migrations/0001_initial.py`, `backend/submissions/tests/__init__.py`, `backend/submissions/tests/test_submissions.py`
- Modify: `backend/config/settings.py`, `backend/config/urls.py`

**Consumes:** `Assignment`, `Enrollment`, and `MAX_UPLOAD_BYTES`. **Produces:** `Submission` with version/file metadata, `POST /assignments/{id}/submissions`, and `GET /assignments/{id}/my-submissions`.

- [ ] **Step 1: Write failing API tests for un-enrolled/late/graded submission, invalid extension/MIME/oversize, successive versions, no file left after rejection, and private history.**

```python
response = self.student_client.post(f"/api/assignments/{self.assignment.id}/submissions", {"file": SimpleUploadedFile("work.exe", b"x", content_type="application/pdf")}, format="multipart")
self.assertEqual(response.status_code, 422)
```

- [ ] **Step 2: Run `cd backend; python manage.py test submissions -v 2` and confirm failure.**

- [ ] **Step 3: Model `Submission(assignment, student, version, file, original_name, mime_type, file_size, note, submitted_at)` with `UniqueConstraint(assignment, student, version)`. Validate extension, MIME, size, 1,000-character note, enrollment, deadline, and no prior grade before calling `file.save`.**

- [ ] **Step 4: Allocate version inside `transaction.atomic()` using the current maximum plus one; serialize filename/size/version/timestamps but never the storage name; write `submission.created` audit data without raw file content/path.**

- [ ] **Step 5: Register/migrate, run `python manage.py test submissions`, and commit.**

```bash
git add backend/submissions backend/config && git commit -m "feat: add versioned student submissions"
```

### Task 2: Add authorized latest-submission, grade, result, and download API

**Files:**
- Modify: `backend/submissions/models.py`, `backend/submissions/serializers.py`, `backend/submissions/views.py`, `backend/submissions/urls.py`, `backend/submissions/tests/test_submissions.py`
- Create: `backend/submissions/migrations/0002_grade_and_criterion_scores.py`

**Consumes:** Task 1 submissions and assignment rubrics. **Produces:** teacher latest list, authorized item/download, grade write, and Student result endpoints.

- [ ] **Step 1: Add failing tests that a Teacher sees one newest version per enrolled Student, cross-owner/download access is denied, manual score is bounded, rubric scores obey maxima and produce the sum, and grade blocks a new upload.**

```python
response = self.teacher_client.put(f"/api/submissions/{self.submission.id}/grade", {"score": 101, "feedback": "Good"}, format="json")
self.assertEqual(response.status_code, 422)
```

- [ ] **Step 2: Run the submissions module and confirm failure.**

- [ ] **Step 3: Add `Grade(submission, teacher, total_score, feedback, graded_at)` and `CriterionScore(grade, criterion, score, feedback)` with one grade per submission. Use owner-scoped assignment queries and select the largest version per Student for `GET /assignments/{id}/submissions`.**

- [ ] **Step 4: Implement `PUT /submissions/{id}/grade`: reject an already graded submission; require either `{score, feedback}` without a rubric or every rubric criterion score with optional feedback; calculate and save rubric total. Implement `/my-result`, `/submissions/{id}`, and a `FileResponse` download route only after Student/Teacher authorization.**

- [ ] **Step 5: Audit grade writes, migrate, run `python manage.py test submissions assignments cohorts`, and commit.**

```bash
git add backend/submissions && git commit -m "feat: add private grading results"
```

### Task 3: Build Student assignment status, upload, history, and result UI

**Files:**
- Modify: `frontend/src/main.tsx`, `frontend/src/pages/StudentCohortsPage.tsx`, `frontend/src/styles.css`
- Create: `frontend/src/submissions.ts`, `frontend/src/pages/StudentCohortPage.tsx`, `frontend/src/pages/StudentCohortPage.test.tsx`

**Consumes:** Tasks 1-2 APIs. **Produces:** `/student/cohorts/:id` assignment status cards and modal upload/history/result flows.

- [ ] **Step 1: Add failing tests for Open/Submitted/Graded/Closed card text and disabled upload while the multipart request is pending.**

```ts
await user.click(screen.getByRole("button", { name: "Submit" }));
expect(screen.getByRole("button", { name: "Upload submission" })).toBeDisabled();
```

- [ ] **Step 2: Run `cd frontend; npm test` and confirm failure.**

- [ ] **Step 3: Add `submissions.ts` API types using `FormData` (do not set `Content-Type` manually), derive state from due time/latest submission/result, and replace the old shared `/cohorts/:id` student page with the Student route.**

- [ ] **Step 4: Implement accessible native dialogs for submit/history/result; show selected file name/size, an upload-in-progress button, version history, total/feedback, and rubric rows when supplied.**

- [ ] **Step 5: Run `npm test; npm run build` and commit.**

```bash
git add frontend/src && git commit -m "feat: add student submission workflow"
```

### Task 4: Build Teacher grading UI

**Files:**
- Modify: `frontend/src/main.tsx`, `frontend/src/styles.css`
- Create: `frontend/src/pages/TeacherSubmissionsPage.tsx`, `frontend/src/pages/TeacherSubmissionsPage.test.tsx`

**Consumes:** Task 2 APIs. **Produces:** `/teacher/assignments/:id/submissions` with latest submissions, download, prev/next controls, and manual/rubric grading form.

- [ ] **Step 1: Add failing tests that previous/next buttons have labels/tooltips, display `1 / 2`, and send rubric criteria rather than a client-computed total.**

```ts
expect(screen.getByRole("button", { name: "Next student" })).toHaveAttribute("title", "Next student");
```

- [ ] **Step 2: Run `npm test` and confirm failure.**

- [ ] **Step 3: Render selected submission metadata and primary authorized download button beside a grading form; use native numeric limits from returned rubric maxima and let API errors remain visible.**

- [ ] **Step 4: Clamp selection when a grade completes, refresh latest submissions, run `npm test; npm run build`, and commit.**

```bash
git add frontend/src && git commit -m "feat: add teacher grading screen"
```

## Feature Gate

All backend/frontend checks pass. An enrolled Student can make v1/v2 before deadline, see only own history/result, while the owner Teacher grades v2 and accesses its private file; subsequent upload fails.
