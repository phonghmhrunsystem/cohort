# Assignments & Rubrics Implementation Plan — Backend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the backend gaps for the Assignments & Rubrics feature described in `docs/overview/03-assignments-and-rubrics.md` and specified in `docs/superpowers/specs/2026-07-30-assignments-and-rubrics-design.md`.

**Architecture:** Backend `assignments/` app already has models/serializers/views/urls; add `created_at` + ordering + teacher-list counts.

**Tech Stack:** Django REST Framework (backend/assignments, backend/grading, backend/submissions, backend/classes).

**Companion doc:** frontend work is tracked separately in `docs/superpowers/plans/2026-07-30-assignments-and-rubrics-frontend.md` — it depends on the `created_at`/`submitted_count`/`graded_count`/`enrolled_count` fields this doc produces.

## Global Constraints

- Backend: no `assertNumQueries` used anywhere in this repo yet — new tests assert correct values, not query counts.
- `AssignmentGrade` (assignments/models.py) is dead/unused — do not wire it up; `graded_count` comes from `grading.Grade`.
- Frontend has no per-request pagination on `GET /api/classes/{id}/assignments` — it returns a plain array, not a `Page<T>`.

---

## Task 1: Backend — `created_at`, ordering, and teacher-list counts

**Files:**
- Modify: `backend/assignments/models.py`
- Create: `backend/assignments/migrations/0003_assignment_created_at.py`
- Modify: `backend/assignments/serializers.py`
- Modify: `backend/assignments/views.py`
- Test: `backend/assignments/tests/test_assignments.py`

**Interfaces:**
- Consumes: `grading.models.Grade` (fields `assignment`, `student`), `submissions.models.Submission` (fields `assignment`, `student`), `classes.models.Class.enrollments` related manager.
- Produces: `Assignment.created_at` (DateTimeField), `Assignment.Meta.ordering = ("-created_at",)`, `AssignmentSerializer` now serializes `created_at`, `submitted_count`, `graded_count`, `enrolled_count` (all `None` for a student caller, real ints for a teacher caller). Later frontend tasks read these exact field names.

- [ ] **Step 1: Write the failing tests**

Append to `backend/assignments/tests/test_assignments.py` (add `Enrollment` to the existing `from classes.models import Class, Enrollment` import — already present):

```python
    def test_assignment_default_ordering_is_newest_first(self):
        older = Assignment.objects.create(
            classroom=self.classroom, title="Older",
            description="Build and document a small application.",
            due_at=timezone.now() + timedelta(days=1),
        )
        newer = Assignment.objects.create(
            classroom=self.classroom, title="Newer",
            description="Build and document a small application.",
            due_at=timezone.now() + timedelta(days=2),
        )
        self.assertEqual(
            list(Assignment.objects.values_list("id", flat=True)),
            [newer.id, older.id],
        )

    def test_teacher_assignment_list_orders_by_created_at_desc_and_includes_counts(self):
        first = self.teacher_client.post(
            f"/api/classes/{self.classroom.id}/assignments", self.payload(title="First"), format="json"
        ).data
        second = self.teacher_client.post(
            f"/api/classes/{self.classroom.id}/assignments", self.payload(title="Second"), format="json"
        ).data

        other_student = User.objects.create_user("other-student@example.test", "pw", role="STUDENT")
        Enrollment.objects.create(classroom=self.classroom, student=other_student)

        Submission.objects.create(
            assignment_id=first["id"], student=self.student, version=1,
            file_path="submissions/a.pdf", original_filename="a.pdf",
            content_type="application/pdf", size=10, note="",
        )
        submission_two = Submission.objects.create(
            assignment_id=first["id"], student=other_student, version=1,
            file_path="submissions/b.pdf", original_filename="b.pdf",
            content_type="application/pdf", size=10, note="",
        )
        Grade.objects.create(
            assignment_id=first["id"], student=other_student, teacher=self.teacher,
            submission=submission_two, total_score=90, feedback="Nice.",
        )

        response = self.teacher_client.get(f"/api/classes/{self.classroom.id}/assignments")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.data], [second["id"], first["id"]])

        first_row = next(row for row in response.data if row["id"] == first["id"])
        second_row = next(row for row in response.data if row["id"] == second["id"])
        self.assertEqual(first_row["submitted_count"], 2)
        self.assertEqual(first_row["graded_count"], 1)
        self.assertEqual(first_row["enrolled_count"], 2)
        self.assertEqual(second_row["submitted_count"], 0)
        self.assertEqual(second_row["graded_count"], 0)
        self.assertEqual(second_row["enrolled_count"], 2)
        self.assertIsNotNone(first_row["created_at"])

        student_response = self.student_client.get(f"/api/classes/{self.classroom.id}/assignments")
        self.assertIsNone(student_response.data[0]["submitted_count"])
        self.assertIsNone(student_response.data[0]["graded_count"])
        self.assertIsNone(student_response.data[0]["enrolled_count"])
```

`Submission` is already imported at the top of the test file (`from submissions.models import Submission`); `Grade` too (`from grading.models import Grade`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python manage.py test assignments -v 2`
Expected: FAIL — `created_at` not a model field / `submitted_count` KeyError (field absent from serializer output).

- [ ] **Step 3: Add the model field and migration**

In `backend/assignments/models.py`, change:

```python
class Assignment(models.Model):
    classroom = models.ForeignKey(Class, on_delete=models.CASCADE, related_name="assignments")
    title = models.CharField(max_length=150)
    description = models.TextField(max_length=5000)
    due_at = models.DateTimeField()
    maximum_score = models.PositiveSmallIntegerField(default=100, editable=False)

    class Meta:
        ordering = ("id",)
```

to:

```python
class Assignment(models.Model):
    classroom = models.ForeignKey(Class, on_delete=models.CASCADE, related_name="assignments")
    title = models.CharField(max_length=150)
    description = models.TextField(max_length=5000)
    due_at = models.DateTimeField()
    maximum_score = models.PositiveSmallIntegerField(default=100, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
```

Create `backend/assignments/migrations/0003_assignment_created_at.py`:

```python
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("assignments", "0002_assignmentgrade"),
    ]

    operations = [
        migrations.AddField(
            model_name="assignment",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AlterModelOptions(
            name="assignment",
            options={"ordering": ("-created_at",)},
        ),
    ]
```

Run `cd backend && python manage.py makemigrations --check --dry-run assignments` to confirm this migration matches what Django would generate (it should report no changes needed once the migration above exists).

- [ ] **Step 4: Add `created_at` and the three count fields to the serializer**

In `backend/assignments/serializers.py`, update `AssignmentSerializer`:

```python
class AssignmentSerializer(serializers.ModelSerializer):
    criteria = RubricCriterionSerializer(many=True, read_only=True)
    maximum_score = serializers.IntegerField(read_only=True)
    learning_state = serializers.SerializerMethodField()
    deadline_badge = serializers.SerializerMethodField()
    closure_reason = serializers.SerializerMethodField()
    submitted_count = serializers.SerializerMethodField()
    graded_count = serializers.SerializerMethodField()
    enrolled_count = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = (
            "id", "classroom_id", "title", "description", "due_at", "maximum_score",
            "criteria", "created_at", "learning_state", "deadline_badge", "closure_reason",
            "submitted_count", "graded_count", "enrolled_count",
        )
        read_only_fields = ("id", "classroom_id", "maximum_score", "criteria", "created_at")
```

Add these three methods next to the existing `get_learning_state`/`get_deadline_badge`/`get_closure_reason`:

```python
    def get_submitted_count(self, assignment):
        counts = self.context.get("counts")
        return counts[assignment.id]["submitted"] if counts else None

    def get_graded_count(self, assignment):
        counts = self.context.get("counts")
        return counts[assignment.id]["graded"] if counts else None

    def get_enrolled_count(self, assignment):
        return self.context.get("enrolled_count")
```

- [ ] **Step 5: Compute the counts in the view**

In `backend/assignments/views.py`, add imports (`Count` and `Submission` at module top, matching the style of `assignments/services.py`):

```python
from django.db import transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from accounts.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from audit.services import write_audit
from classes.views import is_open, scoped_classes
from notifications.services import create_notifications
from submissions.models import Submission

from .models import Assignment, RubricCriterion
from .serializers import AssignmentSerializer, RubricSerializer
```

Replace `ClassAssignmentsView.get`:

```python
    def get(self, request, class_id):
        classroom = get_object_or_404(scoped_classes(request.user), id=class_id)
        if request.user.role not in (User.Role.TEACHER, User.Role.STUDENT):
            return Response(status=status.HTTP_403_FORBIDDEN)
        assignments = list(classroom.assignments.all())
        context = {"classroom": classroom}
        if request.user.role == User.Role.STUDENT:
            context["student"] = request.user
        else:
            from grading.models import Grade

            ids = [assignment.id for assignment in assignments]
            submitted = {
                row["assignment"]: row["n"]
                for row in Submission.objects.filter(assignment__in=ids)
                .values("assignment")
                .annotate(n=Count("student", distinct=True))
            }
            graded = {
                row["assignment"]: row["n"]
                for row in Grade.objects.filter(assignment__in=ids)
                .values("assignment")
                .annotate(n=Count("student", distinct=True))
            }
            context["counts"] = {
                assignment_id: {
                    "submitted": submitted.get(assignment_id, 0),
                    "graded": graded.get(assignment_id, 0),
                }
                for assignment_id in ids
            }
            context["enrolled_count"] = classroom.enrollments.count()
        return Response(AssignmentSerializer(assignments, many=True, context=context).data)
```

(`Grade` stays a local import, matching the existing local import in `AssignmentRubricView.put` — same circular-import reason.)

- [ ] **Step 6: Run migrations and tests to verify they pass**

Run: `cd backend && python manage.py migrate assignments && python manage.py test assignments -v 2`
Expected: PASS, all tests including the two new ones.

- [ ] **Step 7: Commit**

```bash
git add backend/assignments/models.py backend/assignments/migrations/0003_assignment_created_at.py backend/assignments/serializers.py backend/assignments/views.py backend/assignments/tests/test_assignments.py
git commit -m "feat(assignments): add created_at ordering and teacher-list counts"
```

---

## Task 2: Backend verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && python manage.py test`
Expected: PASS, no regressions in other apps (`classes`, `grading`, `submissions`, `notifications`, `audit`).

No commit for this task — it's a checkpoint, not a change.
