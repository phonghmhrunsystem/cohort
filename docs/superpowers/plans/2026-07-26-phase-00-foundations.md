# Phase 00 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a runnable backend/frontend skeleton with the API, media, and test conventions used by all later phases.

**Architecture:** Keep two top-level applications: `backend/` is the Django project and `frontend/` is the Vite SPA. The backend starts with only a health endpoint; domain apps arrive in their owning phases.

**Tech Stack:** Django, Django REST Framework, SimpleJWT, SQLite, React, Vite, TypeScript, Tailwind CSS.

## Global Constraints

- All API routes live below `/api/`.
- API times are UTC ISO-8601 and errors use DRF serializer field errors.
- Private uploads live outside public static routes.
- No domain model is created before the custom user model in Phase 01.

### Task 1: Create the runnable project skeleton

**Files:**
- Create: `backend/manage.py`, `backend/config/settings.py`, `backend/config/urls.py`, `backend/config/asgi.py`, `backend/config/wsgi.py`, `backend/requirements.txt`
- Create: `backend/config/tests/test_health.py`
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/index.css`
- Create: `README.md`, `.env.example`

**Produces:** Django development server on port 8000 and Vite development server on port 5173.

- [ ] **Step 1: Add a failing backend smoke test**

```python
from django.test import SimpleTestCase

class HealthTests(SimpleTestCase):
    def test_health(self):
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})
```

- [ ] **Step 2: Run it and verify it fails because the project does not exist**

Run: `cd backend; python manage.py test`

- [ ] **Step 3: Scaffold Django, install DRF/SimpleJWT, and add `GET /api/health/`**

```python
urlpatterns = [path('api/health/', lambda request: JsonResponse({'status': 'ok'}))]
```

- [ ] **Step 4: Scaffold Vite React TypeScript and render `Class Management` from `App`**

```tsx
export default function App() {
  return <main>Class Management</main>;
}
```

- [ ] **Step 5: Configure SQLite, CORS for `http://localhost:5173`, `MEDIA_ROOT`, and a non-public media URL**

- [ ] **Step 6: Run the smoke test and both development servers**

Run: `cd backend; python manage.py test` and `cd frontend; npm run build`

- [ ] **Step 7: Commit**

```bash
git add backend frontend README.md .env.example
git commit -m "chore: scaffold class management apps"
```

### Task 2: Document local contracts

**Files:**
- Modify: `README.md`

**Produces:** Reproducible setup commands and the canonical API/media conventions.

- [ ] **Step 1: Add exact setup, migration, backend, frontend, and test commands to README**
- [ ] **Step 2: Add the `/api/` prefix, JWT Bearer header, UTC timestamp, and error-status rules**
- [ ] **Step 3: Verify commands in a clean virtual environment and npm install**
- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: record local development contract"
```
