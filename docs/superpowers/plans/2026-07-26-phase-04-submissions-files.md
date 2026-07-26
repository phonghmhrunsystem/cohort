# Phase 4 — Versioned Submissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an enrolled Student make immutable PDF/DOCX submission versions and let the owning Teacher view/download only each Student’s latest version.

**Architecture:** One submission service validates every business rule before saving a file, locks the version sequence in a transaction, and deletes a newly stored file if later persistence fails. Files are never public URLs; download re-checks the caller relationship.

**Tech Stack:** Django, DRF, local Django storage, SQLite, React, TypeScript.

## Global Constraints

- Only PDF and DOCX; validate extension, MIME type, and `MAX_UPLOAD_BYTES` before storage.
- Submission requires enrollment, time before deadline, and no grade for that student/assignment.
- Unique `(assignment, student, version)`; Student sees all own versions; Teacher sees maximum version per Student.

---

### Task 1: Add private versioned submission API

**Files:**
- Create: `backend/submissions/models.py`, `backend/submissions/services.py`, `backend/submissions/serializers.py`, `backend/submissions/views.py`, `backend/submissions/urls.py`, `backend/submissions/tests/test_submissions.py`
- Modify: `backend/config/urls.py`

**Produces:** upload, Teacher latest list, Student history/detail, and protected download routes under `/api/assignments/{id}` and `/api/submissions/{id}`.

- [ ] **Step 1: Write failing tests for invalid-before-storage, v1/v2 history, Teacher latest-only list, late/un-enrolled denial, and download scope.**

```python
def test_invalid_upload_writes_no_file_or_row(self):
    before = list(Path(settings.MEDIA_ROOT).rglob("*"))
    response = self.student_client.post(self.submit_url, {"file": SimpleUploadedFile("bad.txt", b"x", "text/plain")}, format="multipart")
    self.assertEqual(response.status_code, 422)
    self.assertEqual(list(Path(settings.MEDIA_ROOT).rglob("*")), before)

def test_teacher_sees_only_greatest_version_per_student(self):
    self.submit("one.pdf"); self.submit("two.pdf")
    self.assertEqual(self.teacher_client.get(self.teacher_list_url).json()[0]["version"], 2)
```

- [ ] **Step 2: Run `cd backend; python manage.py test submissions.tests`; expect failure.**

- [ ] **Step 3: Add `Submission` with the unique constraint and a transaction-backed `create_submission(*, assignment, student, upload, note)`.**

```python
with transaction.atomic():
    latest = Submission.objects.select_for_update().filter(assignment=assignment, student=student).order_by("-version").first()
    submission = Submission.objects.create(..., version=(latest.version if latest else 0) + 1)
```

- [ ] **Step 4: Before `default_storage.save`, allow only PDF/DOCX extension/MIME pairs and configured size; if later DB/audit work raises, delete the returned storage name. Never serialize `file_path`.**

- [ ] **Step 5: Add relationship-checked streaming download and latest-per-student query; migrate and run `python manage.py test submissions.tests`; expect PASS. Commit.**

```bash
git add backend
git commit -m "feat: add versioned private submissions"
```

### Task 2: Add upload/history/latest UI

**Files:**
- Modify: `frontend/src/pages/AssignmentPage.tsx`
- Create: `frontend/src/components/SubmissionHistory.tsx`, `frontend/src/components/LatestSubmissions.tsx`

**Consumes:** Phase 4 submission API.

- [ ] **Step 1: Add Student multipart file picker/note/upload form and complete own-version history.**

- [ ] **Step 2: Add Teacher list containing only latest file/version per Student and a download link that calls the protected endpoint with JWT.**

- [ ] **Step 3: Browser-check PDF/DOCX uploads produce v1/v2, Teacher sees v2 only, and invalid/late/un-enrolled attempts display errors. Commit.**

```bash
git add frontend
git commit -m "feat: add submission workflow screens"
```

## Phase Gate

Run: `cd backend; python manage.py test submissions.tests`

Expected: PASS, including the no-file-on-rejection assertion. Stop before Phase 5.
