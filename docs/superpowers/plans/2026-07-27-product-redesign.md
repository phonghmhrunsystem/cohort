# Product Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the redesigned local class-management product without adding dependencies.

**Architecture:** Split work by independently testable user-facing feature. Each plan preserves Django as the authorization authority and React as a thin client; later plans consume the routes and models established by earlier ones.

**Tech Stack:** Django 6, Django REST Framework, SimpleJWT, SQLite, local media storage, React 19, TypeScript, Vite, Vitest.

## Global Constraints

- Do not add frontend or backend dependencies.
- Store the access token only in `sessionStorage`; a backend restart invalidates it.
- Return `401` unauthenticated, `403` unauthorized, `404` unavailable, and `422` for business-rule violations.
- All mutations write password- and file-content-free append-only audit records.
- Keep layouts usable at 320px; only essential data tables may scroll horizontally.

---

## Delivery order

1. [Authentication, shared shell, and account administration](2026-07-27-product-redesign-auth-admin.md)
2. [Teacher cohorts, enrollments, assignments, and rubrics](2026-07-27-product-redesign-teacher-coursework.md)
3. [Student submissions, results, and teacher grading](2026-07-27-product-redesign-submissions-grading.md)
4. [Responsive acceptance and demo data](2026-07-27-product-redesign-acceptance.md)

Run one feature plan to its gate before starting its successor. This replaces the old phase roadmap; do not revive dashboard-only scope or new packages from it.
