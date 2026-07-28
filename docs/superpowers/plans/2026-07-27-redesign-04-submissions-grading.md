# Student Work and Teacher Grading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support private versioned student submissions and assigned-Teacher grading.

**Architecture:** `submissions` owns private files, version allocation, grade records, and authorization. File response follows owner checks; grade totals are always server-calculated.

**Tech Stack:** Django, DRF, SQLite, React, TypeScript, Vitest.

## Scope and contract

- Submission endpoints cover upload, own history/result, authorized download, Teacher list/detail, and grade.
- Upload allows DOC/DOCX/PDF/MP4/MOV only, validates MIME and 1 GB before storage, and note `<=1000`.
- Submission output contains display metadata only—never private storage path.

### Task 1: Private versioned submissions

**Files:** create `backend/submissions/{models,serializers,views,urls}.py`, migrations/tests; modify Class/Assignment views/config; create `frontend/src/submissions.ts` and Student pages.

- [ ] Add failing tests for enrollment/period/deadline/graded lock, extensions/MIME, pre-storage 1 GB rejection, note bound, v1/v2, own history, and authorized download.
- [ ] Implement private storage, unique `(assignment,student,version)`, atomic next version, validation before storage, `FileResponse` after authorization, and safe audit event.
- [ ] Run `cd backend; python manage.py test submissions -v 2`.
- [ ] Render enrolled-Class and assignment status cards: Open/Submit, Submitted/History, Graded/Result, or Closed; use native submit/history/result dialogs and preserve `422` input.

### Task 2: Grades and Teacher grading UI

**Files:** extend submissions models/serializers/views/tests; create `frontend/src/pages/TeacherGradingPage.tsx`; modify main/styles/tests.

- [ ] Add failing tests for latest-per-student list, Teacher boundary, manual `0..100`, rubric shape/ranges, server total, audit, and post-grade upload refusal.
- [ ] Implement transactional Grade/CriterionScore for the latest submission while Class is open; persist manual or every rubric criterion and calculate total server-side.
- [ ] Implement a responsive two-column grading screen: selected submission/download, labelled previous/next and `current / total`, manual/rubric form, then refresh/clamp selection after save.
- [ ] Run `cd backend; python manage.py test submissions assignments classes -v 2` and `cd frontend; npm test; npm run build`; prove other Student/Teacher cannot read, download, or grade.

## Feature gate

Private files never expose storage paths. A Student can only view their own work, and only the Class's assigned Teacher may grade its latest submission.
