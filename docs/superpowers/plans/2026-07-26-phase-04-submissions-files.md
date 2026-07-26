# Phase 04 — Versioned Submissions and Private Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept safe, versioned student uploads and provide authorization-checked submission/file reads.

**Architecture:** A submission service validates all domain and file conditions before storage, creates a new immutable version, and writes audit metadata. Files use server-generated names and have no public media route.

**Tech Stack:** Django upload handlers/storage, Django ORM transactions, DRF multipart parsing.

## Global Constraints

- Supported extensions are `.doc`, `.docx`, `.pdf`, and configured video types; MIME must agree with the configured allow-list.
- File size is at most 1 GB and rejection occurs before `storage.save`.
- Each accepted submission creates a new version; a teacher list returns only the latest per student.
- Submission is closed after deadline. Phase 05 adds the grade-lock check after `Grade` exists.

### Task 1: Private storage and submission creation service

**Files:**
- Create: `backend/submissions/models.py`, `backend/submissions/services.py`, `backend/submissions/serializers.py`, `backend/submissions/views.py`, `backend/submissions/urls.py`, `backend/submissions/tests/test_uploads.py`
- Modify: `backend/config/settings.py`, `backend/config/urls.py`

**Interfaces:**
- Consumes: enrolled `Student`, `Assignment`, uploaded multipart `file` and optional `note`.
- Produces: `Submission(..., version)`, `POST /api/assignments/{id}/submissions/`.

- [ ] **Step 1: Write failing upload tests**

```python
def test_rejected_extension_is_not_stored(self):
    upload = SimpleUploadedFile('malware.exe', b'x', content_type='application/octet-stream')
    response = self.client.post(self.url, {'file': upload}, format='multipart')
    self.assertEqual(response.status_code, 422)
    self.assertEqual(Submission.objects.count(), 0)

def test_second_submission_creates_version_two(self):
    self.post_valid_pdf('one.pdf')
    response = self.post_valid_pdf('two.pdf')
    self.assertEqual(response.data['version'], 2)
```

- [ ] **Step 2: Run tests and verify failure**
- [ ] **Step 3: Implement model/unique constraint, allow-list validator, private storage, transactional version allocation, orphan cleanup, and audit writer**
- [ ] **Step 4: Add deadline and enrollment tests; make/apply migration; rerun all upload tests**
- [ ] **Step 5: Commit**

```bash
git add backend/submissions backend/config
git commit -m "feat: add versioned private submissions"
```

### Task 2: Latest/history/detail/download authorization

**Files:**
- Create: `backend/submissions/tests/test_submission_access.py`
- Modify: `backend/submissions/views.py`, `backend/submissions/serializers.py`, `backend/submissions/urls.py`

**Interfaces:**
- Produces: `GET /api/assignments/{id}/submissions/`, `GET /api/assignments/{id}/my-submissions/`, `GET /api/submissions/{id}/`, `GET /api/submissions/{id}/download/`.

- [ ] **Step 1: Write failing access/list tests**

```python
def test_teacher_list_contains_only_latest_submission_per_student(self):
    ids = [item['id'] for item in self.client.get(self.teacher_list_url).data]
    self.assertEqual(ids, [self.student_a_v2.id, self.student_b_v1.id])

def test_other_student_cannot_download_submission(self):
    self.client.force_authenticate(self.other_student)
    self.assertEqual(self.client.get(self.download_url).status_code, 403)
```

- [ ] **Step 2: Run tests and verify failure**
- [ ] **Step 3: Implement latest-per-student queryset, own-history scope, teacher/student detail policy, and streaming protected download**
- [ ] **Step 4: Rerun focused tests and full backend suite**
- [ ] **Step 5: Commit**

```bash
git add backend/submissions
git commit -m "feat: protect submission history and files"
```
