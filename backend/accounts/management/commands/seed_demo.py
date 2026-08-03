"""Build the full demo dataset: roster, Classes, Assignments, Resources,
Submissions, Grades and Notifications.

Run it as often as you like — every write is keyed on a natural key, so a second
run updates rather than duplicates. Volumes are fixed by the brief: 10 Teachers,
80 Students, 12 Classes, 15 Students per Class, 4 Assignments and 5 Resources per
Class (3 links + 2 files).
"""
import random
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from accounts.seed_data import build_roster
from assignments.models import Assignment, AssignmentGrade, RubricCriterion
from classes.models import Class, ClassResource, Enrollment
from grading.models import CriterionScore, Grade
from notifications.models import Notification
from submissions.models import Submission

SEED = 20260803
STUDENTS_PER_CLASS = 15
ASSIGNMENTS_PER_CLASS = 4
LINK_RESOURCES_PER_CLASS = 3
FILE_RESOURCES_PER_CLASS = 2
SUBMISSION_RATE = 0.6
GRADED_RATE = 0.7

# (name, description, starts_at offset in days, ends_at offset in days, is_active).
# The first two match the pair seeded by classes/0001 so the command adopts them
# instead of creating twins.
CLASS_SPECS = [
    ("Python Foundations", "Cú pháp Python, kiểu dữ liệu và cấu trúc điều khiển.", -40, 30, True),
    ("Django Fundamentals", "Model, view, template và ORM của Django.", -35, 35, True),
    ("Cấu trúc dữ liệu và giải thuật", "Danh sách, cây, đồ thị và phân tích độ phức tạp.", -60, 20, True),
    ("Cơ sở dữ liệu quan hệ", "Thiết kế lược đồ, chuẩn hóa và truy vấn SQL.", -50, 25, True),
    ("Lập trình web với React", "Component, state, router và gọi API.", -30, 45, True),
    ("Kiểm thử phần mềm", "Unit test, integration test và test-driven development.", -20, 50, True),
    ("Nhập môn khoa học dữ liệu", "Numpy, pandas và trực quan hóa dữ liệu.", -15, 60, True),
    ("An toàn ứng dụng web", "OWASP Top 10, xác thực và phân quyền.", -10, 70, True),
    ("Kỹ thuật DevOps cơ bản", "Docker, CI/CD và triển khai tự động.", 7, 90, True),
    ("Thiết kế giao diện người dùng", "Nguyên tắc thị giác, accessibility và design system.", 14, 100, True),
    ("Lập trình hướng đối tượng", "Đóng gói, kế thừa, đa hình và các mẫu thiết kế.", -120, -15, True),
    ("Nhập môn lập trình C", "Con trỏ, bộ nhớ và thư viện chuẩn C.", -200, -90, False),
]

ASSIGNMENT_SPECS = [
    ("Bài tập 1 — Khởi động", "Làm quen với công cụ và nộp bài đầu tiên của môn học."),
    ("Bài tập 2 — Thực hành có hướng dẫn", "Hoàn thành các bài thực hành theo hướng dẫn trên lớp."),
    ("Bài tập 3 — Bài tập lớn giữa kỳ", "Xây dựng một sản phẩm nhỏ áp dụng kiến thức nửa đầu môn."),
    ("Bài tập 4 — Đồ án cuối kỳ", "Đồ án tổng hợp, nộp kèm mã nguồn và tài liệu mô tả."),
]

# Totals 100, matching Assignment.maximum_score.
RUBRIC_SPECS = [
    ("Tính đúng đắn", 40),
    ("Chất lượng mã nguồn", 25),
    ("Tài liệu và giải thích", 20),
    ("Nộp đúng hạn", 15),
]

LINK_RESOURCE_SPECS = [
    ("Slide bài giảng", "Bộ slide dùng trên lớp.", "https://docs.google.com/presentation/d/demo-{n}"),
    ("Video ghi hình buổi học", "Bản ghi buổi học gần nhất.", "https://www.youtube.com/watch?v=demo{n}"),
    ("Tài liệu tham khảo", "Đọc thêm trước buổi tiếp theo.", "https://developer.mozilla.org/docs/demo-{n}"),
]

FILE_RESOURCE_SPECS = [
    ("Đề cương môn học", "Đề cương chi tiết và tiêu chí đánh giá.", "de-cuong.pdf", "application/pdf"),
    ("Danh sách bài tập", "Bảng liệt kê bài tập và hạn nộp.", "danh-sach-bai-tap.csv", "text/csv"),
]

FEEDBACK_POOL = [
    "Bài làm đúng yêu cầu, trình bày rõ ràng. Chú ý đặt tên biến nhất quán hơn.",
    "Ý tưởng tốt nhưng thiếu xử lý trường hợp biên. Bổ sung kiểm thử cho phần này.",
    "Hoàn thành đầy đủ các mục. Phần tài liệu còn sơ sài, nên mô tả kỹ hơn.",
    "Mã nguồn chạy đúng, cấu trúc gọn gàng. Tiếp tục giữ chất lượng này.",
    "Nộp muộn so với kế hoạch nhưng nội dung đạt yêu cầu.",
]

# A 1-page PDF small enough to keep in source; enough for a real download to work.
PDF_BYTES = (
    b"%PDF-1.4\n"
    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n"
    b"trailer<</Root 1 0 R>>\n%%EOF\n"
)


class Command(BaseCommand):
    help = "Seed the demo dataset (roster, classes, assignments, resources, submissions, grades)."

    def handle(self, *args, **options):
        self.now = timezone.now()

        with transaction.atomic():
            teachers, students = self.seed_roster()
            classrooms = self.seed_classes(teachers)
            enrollments = self.seed_enrollments(classrooms, students)
            assignments = self.seed_assignments(classrooms)
            resources = self.seed_resources(classrooms)
            submissions = self.seed_submissions(assignments, enrollments)
            grades = self.seed_grades(submissions, classrooms)
            notifications = self.seed_notifications(assignments, enrollments, grades)

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {len(teachers)} teachers, {len(students)} students, {len(classrooms)} classes, "
            f"{sum(len(v) for v in enrollments.values())} enrollments, {len(assignments)} assignments, "
            f"{resources} resources, {len(submissions)} submissions, {len(grades)} grades, "
            f"{notifications} notifications."
        ))

    def rng_for(self, *key):
        """One generator per decision, keyed on the rows it decides about.

        A single shared stream would make the command non-idempotent: a re-run
        skips the rows it already wrote, the stream falls out of step, and
        different rows get picked the second time around.
        """
        return random.Random(":".join((str(SEED),) + tuple(str(part) for part in key)))

    def seed_roster(self):
        teachers, students = [], []
        for entry in build_roster():
            profile = {
                "role": entry["role"],
                "full_name": entry["full_name"],
                "gender": entry["gender"],
                "phone": entry["phone"],
                "date_of_birth": entry["date_of_birth"],
                "hometown": entry["hometown"],
                "address": entry["address"],
                "is_staff": entry["role"] == "ADMIN",
                "is_superuser": entry["role"] == "ADMIN",
            }
            user, _ = User.objects.update_or_create(
                email=entry["email"],
                defaults=profile,
                create_defaults=dict(profile, password=make_password(entry["password"])),
            )
            if user.role == User.Role.TEACHER:
                teachers.append(user)
            elif user.role == User.Role.STUDENT:
                students.append(user)
        return teachers, students

    def seed_classes(self, teachers):
        classrooms = []
        for index, (name, description, starts_in, ends_in, is_active) in enumerate(CLASS_SPECS):
            teacher = teachers[index % len(teachers)]
            classroom, created = Class.objects.get_or_create(
                name=name,
                defaults={
                    "teacher": teacher,
                    "description": description,
                    "starts_at": self.now + timedelta(days=starts_in),
                    "ends_at": self.now + timedelta(days=ends_in),
                    "is_active": is_active,
                },
            )
            if not created:
                # The teacher is deliberately left alone: classes/0001 already
                # picked one, and the API forbids reassigning a Class.
                Class.objects.filter(id=classroom.id).update(
                    description=description,
                    starts_at=self.now + timedelta(days=starts_in),
                    ends_at=self.now + timedelta(days=ends_in),
                    is_active=is_active,
                )
                classroom.refresh_from_db()
            classrooms.append(classroom)
        return classrooms

    def seed_enrollments(self, classrooms, students):
        """A sliding window over the roster: every Class gets 15 distinct
        Students, and the windows overlap so Students sit in ~2 Classes each."""
        enrollments = {}
        for index, classroom in enumerate(classrooms):
            offset = (index * STUDENTS_PER_CLASS) % len(students)
            cohort = [students[(offset + i) % len(students)] for i in range(STUDENTS_PER_CLASS)]
            for student in cohort:
                Enrollment.objects.get_or_create(classroom=classroom, student=student)
            # classes/0001 seeded a handful of enrollments of its own. Drop the
            # ones outside this cohort so every Class really holds 15 — but never
            # unenrol somebody who has already submitted, which would strand
            # their Submissions outside any Class they belong to.
            Enrollment.objects.filter(classroom=classroom).exclude(
                student__in=cohort
            ).exclude(
                student__submissions__assignment__classroom=classroom
            ).delete()
            enrollments[classroom.id] = cohort
        return enrollments

    def seed_assignments(self, classrooms):
        assignments = []
        for classroom in classrooms:
            span = (classroom.ends_at - classroom.starts_at) / (ASSIGNMENTS_PER_CLASS + 1)
            for index, (title, description) in enumerate(ASSIGNMENT_SPECS, start=1):
                # Due dates stay inside the Class window, which the Class
                # serializer requires when the window is later edited.
                due_at = classroom.starts_at + span * index
                assignment, created = Assignment.objects.get_or_create(
                    classroom=classroom,
                    title=title,
                    defaults={"description": description, "due_at": due_at},
                )
                if not created:
                    Assignment.objects.filter(id=assignment.id).update(
                        description=description, due_at=due_at
                    )
                    assignment.refresh_from_db()
                for criterion_title, maximum_score in RUBRIC_SPECS:
                    RubricCriterion.objects.get_or_create(
                        assignment=assignment,
                        title=criterion_title,
                        defaults={"maximum_score": maximum_score},
                    )
                assignments.append(assignment)
        return assignments

    def seed_resources(self, classrooms):
        media_root = Path(settings.MEDIA_ROOT)
        (media_root / "resources").mkdir(parents=True, exist_ok=True)
        count = 0

        for index, classroom in enumerate(classrooms, start=1):
            for title, description, url_template in LINK_RESOURCE_SPECS[:LINK_RESOURCES_PER_CLASS]:
                ClassResource.objects.update_or_create(
                    classroom=classroom,
                    title=title,
                    defaults={
                        "description": description,
                        "url": url_template.format(n=index),
                        "file_path": "",
                        "original_filename": "",
                        "content_type": "",
                        "size": None,
                    },
                )
                count += 1

            for title, description, filename, content_type in FILE_RESOURCE_SPECS[:FILE_RESOURCES_PER_CLASS]:
                # Deterministic name: a re-run rewrites the same file instead of
                # littering MEDIA_ROOT with orphans.
                stored_name = f"resources/demo-{classroom.id}-{filename}"
                payload = PDF_BYTES if filename.endswith(".pdf") else self._csv_payload(classroom)
                (media_root / stored_name).write_bytes(payload)
                ClassResource.objects.update_or_create(
                    classroom=classroom,
                    title=title,
                    defaults={
                        "description": description,
                        "url": "",
                        "file_path": stored_name,
                        "original_filename": filename,
                        "content_type": content_type,
                        "size": len(payload),
                    },
                )
                count += 1
        return count

    def _csv_payload(self, classroom):
        rows = ["stt,ten_bai_tap,han_nop"]
        rows += [
            f"{i},{title.replace(',', ' ')},{(classroom.starts_at + timedelta(days=7 * i)).date()}"
            for i, (title, _) in enumerate(ASSIGNMENT_SPECS, start=1)
        ]
        return ("\n".join(rows) + "\n").encode("utf-8")

    def seed_submissions(self, assignments, enrollments):
        media_root = Path(settings.MEDIA_ROOT)
        (media_root / "submissions").mkdir(parents=True, exist_ok=True)
        submissions = []

        for assignment in assignments:
            if assignment.classroom.starts_at > self.now:
                continue  # nobody can submit to a Class that has not opened
            for student in enrollments[assignment.classroom_id]:
                if self.rng_for("submit", assignment.id, student.id).random() >= SUBMISSION_RATE:
                    continue
                stored_name = f"submissions/demo-{assignment.id}-{student.id}.txt"
                payload = (
                    f"{assignment.title}\n{student.full_name}\n"
                    f"Bài nộp mẫu do seed_demo tạo.\n"
                ).encode("utf-8")
                (media_root / stored_name).write_bytes(payload)
                submission, _ = Submission.objects.update_or_create(
                    assignment=assignment,
                    student=student,
                    version=1,
                    defaults={
                        "file_path": stored_name,
                        "original_filename": f"bai-nop-{student.id}.txt",
                        "content_type": "text/plain",
                        "size": len(payload),
                    },
                )
                submissions.append(submission)
        return submissions

    def seed_grades(self, submissions, classrooms):
        teacher_by_class = {classroom.id: classroom.teacher for classroom in classrooms}
        criteria_by_assignment = {}
        grades = []

        for submission in submissions:
            rng = self.rng_for("grade", submission.assignment_id, submission.student_id)
            if rng.random() >= GRADED_RATE:
                continue
            if Grade.objects.filter(
                assignment_id=submission.assignment_id, student_id=submission.student_id
            ).exists():
                grades.append(submission)
                continue

            assignment = submission.assignment
            criteria = criteria_by_assignment.setdefault(
                assignment.id, list(assignment.criteria.all())
            )
            # Score each criterion between 60% and 100% of its ceiling; the total
            # is their sum, so the rubric and the headline score never disagree.
            scores = [
                (criterion, rng.randint(
                    int(criterion.maximum_score * 0.6), criterion.maximum_score
                ))
                for criterion in criteria
            ]
            total = sum(score for _, score in scores)
            grade = Grade.objects.create(
                assignment=assignment,
                student=submission.student,
                teacher=teacher_by_class[assignment.classroom_id],
                submission=submission,
                total_score=total,
                feedback=rng.choice(FEEDBACK_POOL),
            )
            CriterionScore.objects.bulk_create(
                [CriterionScore(grade=grade, criterion=criterion, score=score) for criterion, score in scores]
            )
            # Mirrors grading.services: the lock table submissions checks against.
            AssignmentGrade.objects.update_or_create(
                assignment=assignment, student=submission.student, defaults={"score": total}
            )
            grades.append(submission)
        return grades

    def seed_notifications(self, assignments, enrollments, graded_submissions):
        """Only the two newest Assignments per Class raise a notification —
        seeding one per Assignment would bury the inbox under 700 rows."""
        wanted = []
        latest_per_class = {}
        for assignment in assignments:
            latest_per_class.setdefault(assignment.classroom_id, []).append(assignment)

        for classroom_id, class_assignments in latest_per_class.items():
            for assignment in sorted(class_assignments, key=lambda a: a.due_at, reverse=True)[:2]:
                for student in enrollments[classroom_id]:
                    wanted.append((
                        student.id, "ASSIGNMENT_CREATED",
                        f"Bài tập mới: {assignment.title}",
                        f"/student/classes/{classroom_id}/assignments/{assignment.id}",
                    ))

        for submission in graded_submissions:
            wanted.append((
                submission.student_id, "GRADE_PUBLISHED",
                f"Đã có điểm: {submission.assignment.title}",
                f"/student/classes/{submission.assignment.classroom_id}"
                f"/assignments/{submission.assignment_id}",
            ))

        existing = set(
            Notification.objects.filter(
                recipient_id__in={item[0] for item in wanted}
            ).values_list("recipient_id", "type", "title", "link")
        )
        fresh = [item for item in wanted if item not in existing]
        Notification.objects.bulk_create([
            Notification(recipient_id=recipient_id, type=type_, title=title, link=link)
            for recipient_id, type_, title, link in fresh
        ])
        return len(fresh)
