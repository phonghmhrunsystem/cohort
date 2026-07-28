# Backend Demo Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed a new local database with stable demo users and cohort membership, and start the Django backend through one Windows batch file.

**Architecture:** A data migration depending on the initial accounts and cohorts migrations creates only missing records through `get_or_create`, preserving any existing user edits. A batch file calls the existing Django migration command before starting the development server; the README exposes the fixed demo credentials.

**Tech Stack:** Django 6, SQLite, Python standard library, Windows batch.

## Global Constraints

- Do not add dependencies.
- Seed only users, cohorts, and enrollments; grade models do not yet exist.
- Keep `phong@gmail.com` / `Admin@123` unchanged once created.
- The batch file must stop when dependency installation or migration fails.

---

### Task 1: Seed migration with regression test

**Files:**
- Create: `backend/accounts/tests/test_seed.py`
- Create: `backend/accounts/migrations/0002_seed_demo_data.py`

**Interfaces:**
- Consumes: `accounts.User`, `cohorts.Cohort`, `cohorts.Enrollment` historical migration models.
- Produces: migration `accounts.0002_seed_demo_data` with `seed_demo_data(apps, schema_editor)`.

- [ ] **Step 1: Write the failing migration test**

```python
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class DemoSeedMigrationTests(TransactionTestCase):
    reset_sequences = True

    def test_seed_migration_creates_loginable_demo_data(self):
        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0001"), ("cohorts", "0001")])
        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0002")])

        apps = executor.loader.project_state([("accounts", "0002")]).apps
        User = apps.get_model("accounts", "User")
        Cohort = apps.get_model("cohorts", "Cohort")
        Enrollment = apps.get_model("cohorts", "Enrollment")
        admin = User.objects.get(email="phong@gmail.com")

        self.assertTrue(admin.check_password("Admin@123"))
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)
        self.assertEqual(User.objects.filter(role="TEACHER").count(), 2)
        self.assertEqual(User.objects.filter(role="STUDENT").count(), 4)
        self.assertEqual(Cohort.objects.count(), 2)
        self.assertEqual(Enrollment.objects.count(), 4)

    def test_seed_migration_keeps_an_existing_admin_unchanged(self):
        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0001"), ("cohorts", "0001")])
        apps = executor.loader.project_state([("accounts", "0001")]).apps
        User = apps.get_model("accounts", "User")
        User.objects.create(
            email="phong@gmail.com", password=make_password("Existing@123"), role="ADMIN"
        )

        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0002")])
        apps = executor.loader.project_state([("accounts", "0002")]).apps
        User = apps.get_model("accounts", "User")

        self.assertTrue(User.objects.get(email="phong@gmail.com").check_password("Existing@123"))
```

Add `from django.contrib.auth.hashers import make_password` to the test imports.

- [ ] **Step 2: Run the test to verify it fails because migration `0002` does not exist**

Run: `python manage.py test accounts.tests.test_seed -v 2`

Expected: FAIL with a migration-node error mentioning `accounts.0002_seed_demo_data`.

- [ ] **Step 3: Add the minimal seed migration**

```python
from django.contrib.auth.hashers import make_password
from django.db import migrations


def seed_demo_data(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    Cohort = apps.get_model("cohorts", "Cohort")
    Enrollment = apps.get_model("cohorts", "Enrollment")

    def user(email, password, role, **extra):
        return User.objects.get_or_create(
            email=email,
            defaults={"password": make_password(password), "role": role, **extra},
        )[0]

    admin = user("phong@gmail.com", "Admin@123", "ADMIN", is_staff=True, is_superuser=True)
    teacher_anh = user("teacher.anh@example.com", "Teacher@123", "TEACHER")
    teacher_binh = user("teacher.binh@example.com", "Teacher@123", "TEACHER")
    student_an = user("student.an@example.com", "Student@123", "STUDENT")
    student_bao = user("student.bao@example.com", "Student@123", "STUDENT")
    student_chi = user("student.chi@example.com", "Student@123", "STUDENT")
    student_dung = user("student.dung@example.com", "Student@123", "STUDENT")

    python, _ = Cohort.objects.get_or_create(
        teacher=teacher_anh, name="Python Foundations", defaults={"description": "Python basics"}
    )
    django, _ = Cohort.objects.get_or_create(
        teacher=teacher_binh, name="Django Fundamentals", defaults={"description": "Django basics"}
    )
    for cohort, student in ((python, student_an), (python, student_bao), (django, student_chi), (django, student_dung)):
        Enrollment.objects.get_or_create(cohort=cohort, student=student)


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial"), ("cohorts", "0001_initial")]
    operations = [migrations.RunPython(seed_demo_data, migrations.RunPython.noop)]
```

Do not use `admin` after its assignment; its creation is the seed requirement.

- [ ] **Step 4: Run the seed regression test**

Run: `python manage.py test accounts.tests.test_seed -v 2`

Expected: PASS; the fresh admin password works, existing admin credentials are preserved, and counts are 2 teachers, 4 students, 2 cohorts, and 4 enrollments.

- [ ] **Step 5: Commit the seed migration and test**

```powershell
git add backend/accounts/migrations/0002_seed_demo_data.py backend/accounts/tests/test_seed.py
git commit -m "feat: seed backend demo data"
```

### Task 2: One-command backend startup and login reference

**Files:**
- Create: `backend/config/tests/test_start_script.py`
- Create: `backend/start-backend.bat`
- Modify: `README.md`

**Interfaces:**
- Consumes: `backend/requirements.txt` and `backend/manage.py`.
- Produces: an executable batch entry point that runs `pip install`, `migrate`, and `runserver` in that order.

- [ ] **Step 1: Write the failing batch-file behavior test**

```python
from pathlib import Path

from django.test import SimpleTestCase


class StartBackendScriptTests(SimpleTestCase):
    def test_installs_dependencies_migrates_then_starts_server(self):
        script = (Path(__file__).resolve().parents[2] / "start-backend.bat").read_text()

        self.assertIn("python -m pip install -r requirements.txt || exit /b 1", script)
        self.assertIn("python manage.py migrate || exit /b 1", script)
        self.assertIn("python manage.py runserver", script)
```

- [ ] **Step 2: Run the test to verify it fails before the batch file exists**

Run: `python manage.py test config.tests.test_start_script -v 2`

Expected: FAIL with `FileNotFoundError` for `backend/start-backend.bat`.

- [ ] **Step 3: Create the minimal batch file and update the README**

```bat
@echo off
cd /d "%~dp0"
python -m pip install -r requirements.txt || exit /b 1
python manage.py migrate || exit /b 1
python manage.py runserver
```

Replace the backend README block with `backend\start-backend.bat`, retain the health endpoint, and add the seven credentials from the approved spec in a Markdown table.

- [ ] **Step 4: Run the batch-file behavior test**

Run: `python manage.py test config.tests.test_start_script -v 2`

Expected: PASS.

- [ ] **Step 5: Run the full backend test suite**

Run: `python manage.py test -v 2`

Expected: PASS with no failures.

- [ ] **Step 6: Commit the startup shortcut and documentation**

```powershell
git add backend/config/tests/test_start_script.py backend/start-backend.bat README.md
git commit -m "docs: simplify backend startup"
```
