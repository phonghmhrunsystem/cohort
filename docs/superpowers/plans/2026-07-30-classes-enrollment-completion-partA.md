# Classes & Enrollment Completion Implementation Plan — Part A: Backend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `backend/classes` and the frontend Classes screens up to spec in `docs/overview/02-classes-and-enrollment.md` — fix backend gaps/bugs (missing `PATCH .../status`, missing `is_open`, blocked teacher reassignment, missing pagination, unfiltered `is_active` scoping, incomplete roster payloads) and build the eight frontend pages that currently do not exist (`/classes/*` is a placeholder route today).

**Architecture:** Backend: extend the existing `classes` Django app (models/serializers/views/urls) in place — no new app. Frontend: mirror the existing Accounts vertical slice exactly (`AccountForm` → `ClassForm`, `AdminUsersPage` → `AdminClassesPage`, etc.) using the same `Field`/`Select`/`Table`/`Dialog`/`Badge`/`Card`/pagination/action-menu components already in `frontend/src/components/`. No new UI library, no new backend app — reuse only.

**Tech Stack:** Django REST (`APIView` + `rest_framework.serializers`), React 19 + TypeScript + Tailwind (no component kit), `react-router-dom`, Vitest, Django `manage.py test`.

## Global Constraints

- Backend tests: run **only** `backend/classes/tests/test_classes.py` (`python manage.py test classes.tests.test_classes -v 2` from `backend/`, or a single class with `classes.tests.test_classes.ClassApiTests`). Never run the full backend suite for this work — other apps' tests are out of scope.
- Frontend tests: `npm run test -- <path>` scoped to the new/changed test file(s) only (Vitest).
- Dates render `en-GB` (`dd/mm/yyyy`) via the existing `formatDate` helper in `frontend/src/pages/AdminUsersPage.tsx`.
- All new frontend pages reuse existing components (`Field`, `Select`, `Table`, `Dialog`, `Badge`, `Card`, `Button`, `Alert`, `Spinner`, `EmptyState`, `useToast`) — do not create new primitives.
- `422` is the server validation-failure status throughout this codebase (not `400`).
- Every admin-mutation gets a `write_audit(...)` call, matching the existing pattern in `classes/views.py`.

---

> **Companion doc:** Frontend work is in [2026-07-30-classes-enrollment-completion-partB.md](2026-07-30-classes-enrollment-completion-partB.md).

## Part A — Backend gap fixes (`backend/classes/`)

### Task 1: `Class`/`Enrollment` timestamps + migration

**Files:**
- Modify: `backend/classes/models.py`
- Create: `backend/classes/migrations/0004_class_timestamps_enrollment_created_at.py` (via `makemigrations`)
- Test: `backend/classes/tests/test_classes.py`

**Interfaces:**
- Produces: `Class.created_at`, `Class.updated_at` (auto timestamps), `Enrollment.created_at` (auto timestamp) — consumed by Task 5 (serializer `student_count`... no), actually consumed by Task 7 (roster `enrolled_at`) and Part B admin Detail/Edit pages ("Record: Created/Last updated").

- [ ] **Step 1: Write the failing test**

Add to `backend/classes/tests/test_classes.py` inside `ClassLifecycleModelTests`:

```python
    def test_class_and_enrollment_carry_timestamps(self):
        classroom = Class.objects.create(
            teacher=User.objects.create_user("teacher-ts@example.test", "pw", role=User.Role.TEACHER),
            name="Timestamps",
            starts_at=timezone.now(),
            ends_at=timezone.now() + timedelta(days=1),
        )
        enrollment = Enrollment.objects.create(
            classroom=classroom,
            student=User.objects.create_user("student-ts@example.test", "pw", role=User.Role.STUDENT),
        )
        self.assertIsNotNone(classroom.created_at)
        self.assertIsNotNone(classroom.updated_at)
        self.assertIsNotNone(enrollment.created_at)
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `python manage.py test classes.tests.test_classes.ClassLifecycleModelTests.test_class_and_enrollment_carry_timestamps -v 2`
Expected: `AttributeError` — `created_at`/`updated_at` don't exist on `Class`/`Enrollment`.

- [ ] **Step 3: Add the fields**

`backend/classes/models.py`:

```python
class Class(models.Model):
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="classes"
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, max_length=1000)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Enrollment(models.Model):
    classroom = models.ForeignKey(Class, on_delete=models.CASCADE, related_name="enrollments")
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="enrollments"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("classroom", "student"), name="unique_class_enrollment")]
```

- [ ] **Step 4: Generate migration and run test**

Run: `python manage.py makemigrations classes` (from `backend/`, with venv active) — this must produce `0004_...py` adding the three fields with sensible defaults for existing rows (`auto_now_add`/`auto_now` handle it; accept Django's prompt to supply a one-off default for existing rows by choosing "provide a default now" → `django.utils.timezone.now`).
Run: `python manage.py test classes.tests.test_classes.ClassLifecycleModelTests.test_class_and_enrollment_carry_timestamps -v 2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/classes/models.py backend/classes/migrations/ backend/classes/tests/test_classes.py
git commit -m "feat(classes): add created_at/updated_at to Class and Enrollment"
```

---

### Task 2: `is_open()` + fix `scoped_classes` to enforce `is_active` for Teacher/Student

This is the security-relevant fix: disabled Classes currently stay visible/reachable for their teacher and enrolled students, contradicting §5/§6 (must 404).

**Files:**
- Modify: `backend/classes/views.py:32-39` (`scoped_classes`), add `is_open` near `is_ended` (`views.py:371-372`)
- Test: `backend/classes/tests/test_classes.py`

**Interfaces:**
- Produces: `is_open(class_) -> bool`, `scoped_classes(user)` now excludes `is_active=False` for Teacher/Student.
- Consumes: `User.Role` from `accounts.models`.

- [ ] **Step 1: Write the failing test**

Add to `ClassApiTests`:

```python
    def test_disabled_class_is_invisible_and_404s_for_teacher_and_student(self):
        self.course.is_active = False
        self.course.save(update_fields=("is_active",))

        list_response = self.teacher_client.get("/api/classes")
        self.assertNotIn(self.course.id, [row["id"] for row in list_response.data])
        self.assertEqual(self.teacher_client.get(f"/api/classes/{self.course.id}").status_code, 404)

        student_list = self.student_client.get("/api/classes")
        self.assertNotIn(self.course.id, [row["id"] for row in student_list.data])
        self.assertEqual(self.student_client.get(f"/api/classes/{self.course.id}").status_code, 404)

        # Admin is unaffected.
        self.assertEqual(self.admin_client.get(f"/api/classes/{self.course.id}").status_code, 200)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test classes.tests.test_classes.ClassApiTests.test_disabled_class_is_invisible_and_404s_for_teacher_and_student -v 2`
Expected: FAIL — teacher/student still see the disabled Class (200 instead of 404).

- [ ] **Step 3: Implement**

`backend/classes/views.py:32-39`:

```python
def scoped_classes(user):
    if user.role == User.Role.ADMIN:
        return Class.objects.select_related("teacher")
    if user.role == User.Role.TEACHER:
        return Class.objects.select_related("teacher").filter(teacher=user, is_active=True)
    if user.role == User.Role.STUDENT:
        return Class.objects.select_related("teacher").filter(enrollments__student=user, is_active=True)
    return Class.objects.none()
```

Add next to `is_ended` (`views.py:371-372`):

```python
def is_open(class_):
    now = timezone.now()
    return class_.is_active and class_.starts_at <= now < class_.ends_at
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test classes.tests.test_classes.ClassApiTests.test_disabled_class_is_invisible_and_404s_for_teacher_and_student -v 2`
Expected: PASS
Also re-run the full class test module to catch regressions: `python manage.py test classes.tests.test_classes -v 2`

- [ ] **Step 5: Commit**

```bash
git add backend/classes/views.py backend/classes/tests/test_classes.py
git commit -m "fix(classes): scope disabled Classes out of Teacher/Student reads, add is_open()"
```

---

### Task 3: `PATCH /api/classes/{id}/status` (Bật/Tắt)

**Files:**
- Modify: `backend/classes/views.py` (new `ClassStatusView`), `backend/classes/urls.py`
- Test: `backend/classes/tests/test_classes.py`

**Interfaces:**
- Consumes: `is_ended`... no — uses `class_.starts_at` and `timezone.now()` directly per spec ("Disable only while `now < starts_at`"), `write_audit`.
- Produces: route `PATCH /api/classes/{id}/status`, body `{"is_active": bool}`, admin-only.

- [ ] **Step 1: Write the failing test**

```python
    def test_status_toggle_admin_only_and_blocks_disable_after_start(self):
        self.assertEqual(
            self.teacher_client.patch(f"/api/classes/{self.course.id}/status", {"is_active": False}, format="json").status_code,
            403,
        )
        # self.course already started (starts_at = now - 1 day) -> disabling is blocked.
        response = self.admin_client.patch(f"/api/classes/{self.course.id}/status", {"is_active": False}, format="json")
        self.assertEqual(response.status_code, 422)

        future_course = Class.objects.create(
            teacher=self.teacher, name="Future", starts_at=timezone.now() + timedelta(days=1),
            ends_at=timezone.now() + timedelta(days=2),
        )
        disable = self.admin_client.patch(f"/api/classes/{future_course.id}/status", {"is_active": False}, format="json")
        self.assertEqual(disable.status_code, 200)
        self.assertFalse(disable.data["is_active"])
        self.assertEqual(AuditLog.objects.filter(target_type="classes.class", target_id=future_course.id, action="class.status_changed").count(), 1)

        enable = self.admin_client.patch(f"/api/classes/{future_course.id}/status", {"is_active": True}, format="json")
        self.assertEqual(enable.status_code, 200)
        self.assertTrue(enable.data["is_active"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test classes.tests.test_classes.ClassApiTests.test_status_toggle_admin_only_and_blocks_disable_after_start -v 2`
Expected: FAIL — `404 Not Found` (no route yet).

- [ ] **Step 3: Implement**

`backend/classes/views.py` — add after `ClassDetailView` (after line 93):

```python
class ClassStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, class_id):
        if request.user.role != User.Role.ADMIN:
            return Response(status=status.HTTP_403_FORBIDDEN)
        class_ = get_scoped_class(request.user, class_id)
        is_active = request.data.get("is_active")
        if not isinstance(is_active, bool):
            return Response({"is_active": ["This field is required."]}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        if is_active is False and timezone.now() >= class_.starts_at:
            return closed_response("Class cannot be disabled once it has started.")
        with transaction.atomic():
            class_.is_active = is_active
            class_.save(update_fields=("is_active",))
            write_audit(
                actor=request.user,
                action="class.status_changed",
                target=class_,
                metadata={"is_active": is_active},
            )
        return Response(ClassSerializer(class_).data)
```

Note: `get_scoped_class` uses `scoped_classes(request.user)`, which for Admin returns all Classes regardless of `is_active` (Task 2 only restricted Teacher/Student) — so admin can still reach and re-enable a disabled Class. Good, no change needed there.

`backend/classes/urls.py`:

```python
from django.urls import path

from .views import ClassDetailView, ClassesView, ClassResourcesView, ClassStatusView, EnrollmentView, GradebookCsvView, GradebookView, StudentDetailView, StudentsView


urlpatterns = [
    path("classes", ClassesView.as_view()),
    path("classes/<int:class_id>", ClassDetailView.as_view()),
    path("classes/<int:class_id>/status", ClassStatusView.as_view()),
    path("classes/<int:class_id>/gradebook", GradebookView.as_view()),
    path("classes/<int:class_id>/gradebook.csv", GradebookCsvView.as_view()),
    path("classes/<int:class_id>/students", StudentsView.as_view()),
    path("classes/<int:class_id>/students/<int:student_id>", StudentDetailView.as_view()),
    path("classes/<int:class_id>/enrollments", EnrollmentView.as_view()),
    path("classes/<int:class_id>/enrollments/<int:student_id>", EnrollmentView.as_view()),
    path("classes/<int:class_id>/resources", ClassResourcesView.as_view()),
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test classes.tests.test_classes.ClassApiTests.test_status_toggle_admin_only_and_blocks_disable_after_start -v 2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/classes/views.py backend/classes/urls.py backend/classes/tests/test_classes.py
git commit -m "feat(classes): add PATCH /api/classes/{id}/status (Bật/Tắt toggle)"
```

---

### Task 4: List pagination, `?teacher=` filter, `student_count`

**Files:**
- Modify: `backend/classes/views.py:42-50` (`ClassesView.get`), `backend/classes/serializers.py:16-28` (`ClassSerializer`)
- Test: `backend/classes/tests/test_classes.py`

**Interfaces:**
- Produces: `GET /api/classes` returns DRF `PageNumberPagination` envelope (`count`/`next`/`previous`/`results`), each row has `student_count`; `?teacher=` filters by teacher name or id (Admin only).
- Consumes: `rest_framework.pagination.PageNumberPagination` (already used the same way in `backend/accounts/views.py:159-161`).

- [ ] **Step 1: Write the failing test**

```python
    def test_list_is_paginated_with_student_count_and_teacher_filter(self):
        for index in range(11):
            Class.objects.create(
                teacher=self.teacher, name=f"Bulk {index}",
                starts_at=timezone.now(), ends_at=timezone.now() + timedelta(days=1),
            )
        response = self.admin_client.get("/api/classes")
        self.assertEqual(len(response.data["results"]), 10)
        self.assertEqual(response.data["count"], 13)  # course + other_course + 11 bulk

        page2 = self.admin_client.get("/api/classes?page=2")
        self.assertEqual(len(page2.data["results"]), 3)

        row = next(r for r in response.data["results"] if r["id"] == self.course.id)
        self.assertEqual(row["student_count"], 1)

        by_teacher = self.admin_client.get(f"/api/classes?teacher={self.teacher.id}")
        self.assertTrue(all(r["teacher"]["id"] == self.teacher.id for r in by_teacher.data["results"]))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test classes.tests.test_classes.ClassApiTests.test_list_is_paginated_with_student_count_and_teacher_filter -v 2`
Expected: FAIL — response is a bare list (`response.data["results"]` raises `TypeError`).

- [ ] **Step 3: Implement**

`backend/classes/serializers.py:16-28` — add `student_count`:

```python
class ClassSerializer(serializers.ModelSerializer):
    teacher_id = serializers.PrimaryKeyRelatedField(
        source="teacher",
        queryset=User.objects.filter(
            role=User.Role.TEACHER, is_active=True, is_deleted=False
        ),
    )
    teacher = TeacherDisplaySerializer(read_only=True)
    progress = serializers.SerializerMethodField()
    student_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Class
        fields = ("id", "teacher_id", "teacher", "name", "description", "starts_at", "ends_at", "is_active", "student_count", "progress")
```

`backend/classes/views.py` imports — add `Count` is already imported (line 5 has `Count`). Update `ClassesView.get`:

```python
from rest_framework.pagination import PageNumberPagination


class ClassesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        classes = scoped_classes(request.user).annotate(student_count=Count("enrollments", distinct=True))
        if query := request.query_params.get("q", "").strip():
            classes = classes.filter(name__icontains=query)
        if request.user.role == User.Role.ADMIN and (teacher := request.query_params.get("teacher", "").strip()):
            classes = classes.filter(Q(teacher__full_name__icontains=teacher) | Q(teacher_id=teacher if teacher.isdigit() else None))
        context = {"student": request.user} if request.user.role == User.Role.STUDENT else {}
        paginator = PageNumberPagination()
        paginator.page_size = 10
        page = paginator.paginate_queryset(classes.order_by("id").distinct(), request)
        return Response(paginator.get_paginated_response(ClassSerializer(page, many=True, context=context).data).data)
```

Add the `PageNumberPagination` import at the top of `views.py` next to the other `rest_framework` imports (`from rest_framework import serializers, status`).

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test classes.tests.test_classes.ClassApiTests.test_list_is_paginated_with_student_count_and_teacher_filter -v 2`
Expected: PASS
Then: `python manage.py test classes.tests.test_classes -v 2` — fix any test that asserted `response.data` was a bare list (e.g. `test_list_search_is_scoped_by_role` at line 160) by wrapping expectations in `response.data["results"]`.

- [ ] **Step 5: Commit**

```bash
git add backend/classes/views.py backend/classes/serializers.py backend/classes/tests/test_classes.py
git commit -m "feat(classes): paginate class list, add teacher filter and student_count"
```

---

### Task 5: Roster pagination + full roster fields (`phone`, `hometown`, `enrolled_at`, `is_active`)

**Files:**
- Modify: `backend/classes/views.py:134-166` (`StudentsView.get`), `backend/classes/serializers.py` (`StudentProgressSerializer`), `backend/classes/views.py:361-364` (`StudentSerializer` for candidates)
- Test: `backend/classes/tests/test_classes.py`

**Interfaces:**
- Produces: `GET /api/classes/{id}/students` paginated (10/page) results carrying `id, full_name, email, phone, hometown, enrolled_at, is_active, submitted_assignments, graded_assignments`; totals (`enrolled_students`, `submitted_students`, `graded_students`, `total_assignments`) stay whole-roster (unpaginated) at the response top level, per spec §2.4/§6 ("totals stay whole-roster").
- Consumes: `Enrollment.created_at` from Task 1 for `enrolled_at`.

- [ ] **Step 1: Write the failing test**

```python
    def test_roster_is_paginated_with_full_fields_and_whole_roster_totals(self):
        for index in range(12):
            student = User.objects.create_user(f"bulk-student-{index}@example.test", "pw", role="STUDENT", hometown="Ha Noi")
            Enrollment.objects.create(classroom=self.course, student=student)
        response = self.admin_client.get(f"/api/classes/{self.course.id}/students")
        self.assertEqual(len(response.data["students"]["results"]), 10)
        self.assertEqual(response.data["enrolled_students"], 13)  # self.student + 12 bulk
        row = response.data["students"]["results"][0]
        for key in ("phone", "hometown", "enrolled_at", "is_active"):
            self.assertIn(key, row)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test classes.tests.test_classes.ClassApiTests.test_roster_is_paginated_with_full_fields_and_whole_roster_totals -v 2`
Expected: FAIL — `response.data["students"]` is a plain list (no `"results"` key) and rows lack `phone`/`hometown`/`enrolled_at`/`is_active`.

- [ ] **Step 3: Implement**

`backend/classes/serializers.py` — extend `StudentProgressSerializer`:

```python
class StudentProgressSerializer(serializers.ModelSerializer):
    submitted_assignments = serializers.IntegerField(read_only=True)
    graded_assignments = serializers.IntegerField(read_only=True)
    enrolled_at = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id", "full_name", "email", "phone", "hometown", "is_active",
            "enrolled_at", "submitted_assignments", "graded_assignments",
        )

    def get_enrolled_at(self, student):
        enrollment = self.context.get("enrollments", {}).get(student.id)
        return enrollment.isoformat() if enrollment else None
```

`backend/classes/views.py` — `students_progress_queryset` gains the enrollment map needed for `enrolled_at` (annotate directly instead, simpler):

```python
def students_progress_queryset(class_):
    """Enrolled, non-deleted Students annotated with backend-computed progress counts
    and enrollment date (never derive these from a filtered list on the frontend)."""
    return User.objects.filter(
        enrollments__classroom=class_, role=User.Role.STUDENT, is_deleted=False
    ).annotate(
        enrolled_at=F("enrollments__created_at"),
        submitted_assignments=Count(
            "submissions__assignment",
            filter=Q(submissions__assignment__classroom=class_),
            distinct=True,
        ),
        graded_assignments=Count(
            "grading_grades__assignment",
            filter=Q(grading_grades__assignment__classroom=class_),
            distinct=True,
        ),
    )
```

Since `enrolled_at` is now a queryset annotation (a real `DateTimeField` value on each row), simplify the serializer back to a plain field instead of `SerializerMethodField`:

```python
class StudentProgressSerializer(serializers.ModelSerializer):
    submitted_assignments = serializers.IntegerField(read_only=True)
    graded_assignments = serializers.IntegerField(read_only=True)
    enrolled_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id", "full_name", "email", "phone", "hometown", "is_active",
            "enrolled_at", "submitted_assignments", "graded_assignments",
        )
```

`backend/classes/views.py` — paginate `StudentsView.get` roster branch (lines 148-166):

```python
        if request.user.role not in (User.Role.ADMIN, User.Role.TEACHER):
            return Response(status=status.HTTP_403_FORBIDDEN)
        students = list(students_progress_queryset(class_).order_by("id"))
        rows = students_progress_queryset(class_).order_by("id")
        if query := request.query_params.get("q", "").strip():
            rows = rows.filter(Q(full_name__icontains=query) | Q(email__icontains=query))
        paginator = PageNumberPagination()
        paginator.page_size = 10
        page = paginator.paginate_queryset(rows, request)
        return Response(
            {
                "total_assignments": class_.assignments.count(),
                "enrolled_students": len(students),
                "submitted_students": sum(1 for s in students if s.submitted_assignments > 0),
                "graded_students": sum(1 for s in students if s.graded_assignments > 0),
                "students": paginator.get_paginated_response(StudentProgressSerializer(page, many=True).data).data,
            }
        )
```

Also extend the candidates `StudentSerializer` (`views.py:361-364`) so the "Edit roster" add-dialog can show hometown/phone/status:

```python
class StudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "full_name", "email", "phone", "hometown", "is_active")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test classes.tests.test_classes.ClassApiTests.test_roster_is_paginated_with_full_fields_and_whole_roster_totals -v 2`
Expected: PASS
Then run the whole module and fix any test indexing `response.data["students"]` as a bare list (e.g. `test_roster_search_handles_student_with_null_full_name` around line 435) to use `response.data["students"]["results"]`.

- [ ] **Step 5: Commit**

```bash
git add backend/classes/views.py backend/classes/serializers.py backend/classes/tests/test_classes.py
git commit -m "feat(classes): paginate roster, expose phone/hometown/enrolled_at/is_active"
```

---

### Task 6: Student-scoped Class detail fields (`assignment_count`, `graded_count`, `next_due_at`)

**Files:**
- Modify: `backend/classes/serializers.py:61-80` (`ClassSerializer.get_progress`)
- Test: `backend/classes/tests/test_classes.py` (existing `test_enrolled_student_class_includes_server_computed_progress_and_nearest_deadline` at line 182 needs updating to the new field names)

**Interfaces:**
- Produces: for a Student caller, `GET /api/classes/{id}` includes top-level `assignment_count`, `graded_count`, `next_due_at` (spec §3/§2.5 exact names) instead of the nested `progress: {...}` object.

- [ ] **Step 1: Update the existing test**

Read `backend/classes/tests/test_classes.py:182-227` first, then replace its `response.data["progress"]["..."]` assertions with the flat field names, e.g.:

```python
        self.assertEqual(response.data["graded_count"], <expected>)
        self.assertEqual(response.data["assignment_count"], <expected>)
        self.assertEqual(response.data["next_due_at"], <expected_iso_or_None>)
```

(Keep the existing setup/fixtures in that test — only the assertion keys change.)

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test classes.tests.test_classes.ClassApiTests.test_enrolled_student_class_includes_server_computed_progress_and_nearest_deadline -v 2`
Expected: FAIL — `KeyError: 'graded_count'`.

- [ ] **Step 3: Implement**

`backend/classes/serializers.py:16-28` and `61-80`:

```python
class ClassSerializer(serializers.ModelSerializer):
    teacher_id = serializers.PrimaryKeyRelatedField(
        source="teacher",
        queryset=User.objects.filter(
            role=User.Role.TEACHER, is_active=True, is_deleted=False
        ),
    )
    teacher = TeacherDisplaySerializer(read_only=True)
    student_count = serializers.IntegerField(read_only=True)
    assignment_count = serializers.SerializerMethodField()
    graded_count = serializers.SerializerMethodField()
    next_due_at = serializers.SerializerMethodField()

    class Meta:
        model = Class
        fields = (
            "id", "teacher_id", "teacher", "name", "description", "starts_at", "ends_at",
            "is_active", "student_count", "assignment_count", "graded_count", "next_due_at",
        )

    # ...validate_name / validate_description / validate_teacher_id / validate unchanged...

    def _student_states(self, classroom):
        student = self.context.get("student")
        if not student:
            return None
        now = timezone.now()
        return [
            (assignment, assignment_learning_state(assignment, student, now))
            for assignment in classroom.assignments.all()
        ]

    def get_assignment_count(self, classroom):
        states = self._student_states(classroom)
        return len(states) if states is not None else None

    def get_graded_count(self, classroom):
        states = self._student_states(classroom)
        return sum(state == "GRADED" for _, state in states) if states is not None else None

    def get_next_due_at(self, classroom):
        states = self._student_states(classroom)
        if states is None:
            return None
        nearest = min(
            (assignment.due_at for assignment, state in states if state in ("OPEN", "SUBMITTED")),
            default=None,
        )
        return nearest.isoformat() if nearest else None
```

Remove the old `progress`/`get_progress` field entirely (superseded). Note `_student_states` recomputes per field call — acceptable at this scale (one Class's assignments), matches the existing per-call pattern already in the codebase.

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test classes.tests.test_classes.ClassApiTests.test_enrolled_student_class_includes_server_computed_progress_and_nearest_deadline -v 2`
Expected: PASS
Then: `python manage.py test classes.tests.test_classes -v 2` (full module, still scoped to this app only) — this task changes the public shape of `ClassSerializer`, so also fix Task 4/5's tests if they assert on `progress`.

- [ ] **Step 5: Commit**

```bash
git add backend/classes/serializers.py backend/classes/tests/test_classes.py
git commit -m "feat(classes): expose assignment_count/graded_count/next_due_at per spec §2.5"
```

---

### Task 7: Enable teacher reassignment + audit + notifications

**Files:**
- Modify: `backend/classes/serializers.py:44-46` (`ClassSerializer.validate`), `backend/classes/views.py:76-93` (`ClassDetailView.patch`), `backend/notifications/services.py` (add `notify_user`)
- Test: `backend/classes/tests/test_classes.py` — **replace** `test_create_requires_an_active_teacher_and_teacher_cannot_change` (line 80) since it currently locks in the wrong (spec-violating) behavior

**Interfaces:**
- Produces: `notify_user(user, type, title, link)` in `notifications/services.py` (single-recipient sibling of the existing `create_notifications(classroom, ...)` roster fan-out).
- Consumes: `write_audit` (`audit/services.py`), `is_ended` (`classes/views.py`).

- [ ] **Step 1: Replace the outdated test**

Replace `test_create_requires_an_active_teacher_and_teacher_cannot_change` (`backend/classes/tests/test_classes.py:80-90`) with two tests:

```python
    def test_create_requires_an_active_teacher(self):
        self.teacher.is_active = False
        self.teacher.save(update_fields=("is_active",))
        response = self.admin_client.post("/api/classes", self.class_payload(teacher_id=self.teacher.id), format="json")
        self.assertEqual(response.status_code, 422)

    def test_teacher_reassignment_is_allowed_until_class_ends_and_notifies_both_teachers(self):
        response = self.admin_client.patch(
            f"/api/classes/{self.course.id}", {"teacher_id": self.other_teacher.id}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.course.refresh_from_db()
        self.assertEqual(self.course.teacher_id, self.other_teacher.id)

        audit = AuditLog.objects.get(target_type="classes.class", target_id=self.course.id, action="class.teacher_changed")
        self.assertEqual(audit.metadata["from_teacher_id"], self.teacher.id)
        self.assertEqual(audit.metadata["to_teacher_id"], self.other_teacher.id)

        from notifications.models import Notification
        self.assertTrue(Notification.objects.filter(recipient=self.teacher, type="CLASS_UNASSIGNED").exists())
        self.assertTrue(Notification.objects.filter(recipient=self.other_teacher, type="CLASS_ASSIGNED").exists())

        ended = Class.objects.create(
            teacher=self.teacher, name="Ended", starts_at=timezone.now() - timedelta(days=10),
            ends_at=timezone.now() - timedelta(days=1),
        )
        blocked = self.admin_client.patch(f"/api/classes/{ended.id}", {"teacher_id": self.other_teacher.id}, format="json")
        self.assertEqual(blocked.status_code, 422)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test classes.tests.test_classes.ClassApiTests.test_teacher_reassignment_is_allowed_until_class_ends_and_notifies_both_teachers -v 2`
Expected: FAIL — current serializer rejects the `teacher_id` change with `422` (`serializers.py:44-46`).

- [ ] **Step 3: Implement**

`backend/notifications/services.py` — add:

```python
from .models import Notification


def create_notifications(classroom, type, title, link):
    Notification.objects.bulk_create([
        Notification(recipient_id=student_id, type=type, title=title, link=link)
        for student_id in classroom.enrollments.values_list("student_id", flat=True)
    ])


def notify_user(user, type, title, link):
    Notification.objects.create(recipient=user, type=type, title=title, link=link)
```

`backend/classes/serializers.py:44-46` — drop the reassignment block, keep the rest of `validate`:

```python
    def validate(self, attrs):
        starts_at = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends_at = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts_at and ends_at and starts_at >= ends_at:
            raise serializers.ValidationError({"ends_at": ["End time must be after start time."]})
        if (
            self.instance
            and "ends_at" in attrs
            and self.instance.assignments.filter(due_at__gt=ends_at).exists()
        ):
            raise serializers.ValidationError(
                {"ends_at": ["End time cannot precede an Assignment due date."]}
            )
        return attrs
```

`backend/classes/views.py:76-93` — `ClassDetailView.patch` needs to detect a teacher change before saving (to know old/new ids) and fire the audit + notifications in the same transaction:

```python
    def patch(self, request, class_id):
        if request.user.role != User.Role.ADMIN:
            return Response(status=status.HTTP_403_FORBIDDEN)
        class_ = get_scoped_class(request.user, class_id)
        if is_ended(class_):
            return closed_response()
        previous_teacher_id = class_.teacher_id
        serializer = ClassSerializer(class_, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        with transaction.atomic():
            class_ = serializer.save()
            write_audit(
                actor=request.user,
                action="class.updated",
                target=class_,
                metadata=class_metadata(class_),
            )
            if class_.teacher_id != previous_teacher_id:
                write_audit(
                    actor=request.user,
                    action="class.teacher_changed",
                    target=class_,
                    metadata={"from_teacher_id": previous_teacher_id, "to_teacher_id": class_.teacher_id},
                )
                notify_user(User.objects.get(id=previous_teacher_id), "CLASS_UNASSIGNED", f"Unassigned from {class_.name}", f"/teacher/classes")
                notify_user(class_.teacher, "CLASS_ASSIGNED", f"Assigned to {class_.name}", f"/teacher/classes/{class_.id}")
        return Response(ClassSerializer(class_).data)
```

Add `from notifications.services import create_notifications, notify_user` (update the existing import line 17 of `views.py`).

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test classes.tests.test_classes.ClassApiTests.test_teacher_reassignment_is_allowed_until_class_ends_and_notifies_both_teachers classes.tests.test_classes.ClassApiTests.test_create_requires_an_active_teacher -v 2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/classes/views.py backend/classes/serializers.py backend/notifications/services.py backend/classes/tests/test_classes.py
git commit -m "feat(classes): allow teacher reassignment with audit trail and notifications"
```

---

### Task 8: `ends_at`-only extension escape hatch on an ended Class

**Files:**
- Modify: `backend/classes/views.py:76-93` (`ClassDetailView.patch`)
- Test: `backend/classes/tests/test_classes.py`

**Interfaces:**
- Produces: a `PATCH` on an ended Class succeeds only when the payload's keys are exactly `{"ends_at"}` and the new `ends_at` is in the future; writes `class.reopened` audit instead of `class.updated`.

- [ ] **Step 1: Write the failing test**

```python
    def test_ends_at_only_extension_reopens_an_ended_class(self):
        ended = Class.objects.create(
            teacher=self.teacher, name="Ended", starts_at=timezone.now() - timedelta(days=10),
            ends_at=timezone.now() - timedelta(days=1),
        )
        new_end = timezone.now() + timedelta(days=5)

        mixed = self.admin_client.patch(f"/api/classes/{ended.id}", {"ends_at": new_end.isoformat(), "name": "Renamed"}, format="json")
        self.assertEqual(mixed.status_code, 422)

        extend = self.admin_client.patch(f"/api/classes/{ended.id}", {"ends_at": new_end.isoformat()}, format="json")
        self.assertEqual(extend.status_code, 200)
        ended.refresh_from_db()
        self.assertAlmostEqual(ended.ends_at.timestamp(), new_end.timestamp(), delta=1)
        self.assertTrue(AuditLog.objects.filter(target_type="classes.class", target_id=ended.id, action="class.reopened").exists())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test classes.tests.test_classes.ClassApiTests.test_ends_at_only_extension_reopens_an_ended_class -v 2`
Expected: FAIL — both requests currently `422` via the unconditional `is_ended` guard.

- [ ] **Step 3: Implement**

`backend/classes/views.py:76-93`, combined with Task 7's version:

```python
    def patch(self, request, class_id):
        if request.user.role != User.Role.ADMIN:
            return Response(status=status.HTTP_403_FORBIDDEN)
        class_ = get_scoped_class(request.user, class_id)
        is_extension = set(request.data.keys()) == {"ends_at"}
        if is_ended(class_) and not is_extension:
            return closed_response()
        previous_teacher_id = class_.teacher_id
        serializer = ClassSerializer(class_, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        was_ended = is_ended(class_)
        if is_extension and was_ended and serializer.validated_data["ends_at"] <= timezone.now():
            return closed_response("Extension must move ends_at into the future.")
        with transaction.atomic():
            class_ = serializer.save()
            write_audit(
                actor=request.user,
                action="class.reopened" if (is_extension and was_ended) else "class.updated",
                target=class_,
                metadata=class_metadata(class_),
            )
            if class_.teacher_id != previous_teacher_id:
                write_audit(
                    actor=request.user,
                    action="class.teacher_changed",
                    target=class_,
                    metadata={"from_teacher_id": previous_teacher_id, "to_teacher_id": class_.teacher_id},
                )
                notify_user(User.objects.get(id=previous_teacher_id), "CLASS_UNASSIGNED", f"Unassigned from {class_.name}", "/teacher/classes")
                notify_user(class_.teacher, "CLASS_ASSIGNED", f"Assigned to {class_.name}", f"/teacher/classes/{class_.id}")
        return Response(ClassSerializer(class_).data)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test classes.tests.test_classes.ClassApiTests.test_ends_at_only_extension_reopens_an_ended_class -v 2`
Expected: PASS
Then full module: `python manage.py test classes.tests.test_classes -v 2` (includes `test_ended_class_is_read_only_for_admin` at line 251 — verify it still passes since that test doesn't send an `ends_at`-only payload).

- [ ] **Step 5: Commit**

```bash
git add backend/classes/views.py backend/classes/tests/test_classes.py
git commit -m "feat(classes): allow ends_at-only extension to reopen an ended class"
```

---

### Task 9: Remove `GET /api/classes/{id}/enrollments`

**Files:**
- Modify: `backend/classes/views.py:183-195` (`EnrollmentView.get` — delete the method), `backend/classes/tests/test_classes.py`

**Interfaces:**
- Removes the `get` method from `EnrollmentView` — `post`/`delete`/`put` untouched. `urls.py` keeps the same routes (both map to `EnrollmentView.as_view()`; DRF returns `405` for the now-undefined `GET`).

- [ ] **Step 1: Update the test**

Find `test_enrollment_read_returns_current_roster_to_admin_and_assigned_teacher` (`backend/classes/tests/test_classes.py:241`) and replace its body with a `405` assertion instead of asserting roster contents (the roster read now only exists via `/students`):

```python
    def test_enrollment_get_route_is_removed(self):
        self.assertEqual(self.admin_client.get(f"/api/classes/{self.course.id}/enrollments").status_code, 405)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test classes.tests.test_classes.ClassApiTests.test_enrollment_get_route_is_removed -v 2`
Expected: FAIL — currently `200`.

- [ ] **Step 3: Implement**

`backend/classes/views.py` — delete the `get` method from `EnrollmentView` (lines 186-195), leaving `post`/`delete`/`put` as the class body.

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test classes.tests.test_classes.ClassApiTests.test_enrollment_get_route_is_removed -v 2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/classes/views.py backend/classes/tests/test_classes.py
git commit -m "refactor(classes): remove GET /classes/{id}/enrollments per spec"
```

