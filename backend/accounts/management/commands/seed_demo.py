"""Bulk demo data: 1 admin, 12 teachers, 80 students, 20 classes (15 students
each), 4 resources + 4 assignments per class, ~60% submission rate, ~70% of
submissions graded.

Usage:
    python manage.py seed_demo            # create (skip if demo classes exist)
    python manage.py seed_demo --flush    # wipe prior demo data, then recreate
"""
import random
import uuid
from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from accounts.seed_data import HOMETOWNS, PHONE_PREFIXES
from assignments.models import Assignment, RubricCriterion
from classes.models import Class, ClassResource, Enrollment
from grading.models import CriterionScore, Grade
from submissions.models import Submission

CLASS_PREFIX = "Lop Demo"

SURNAMES = ["Nguyen", "Tran", "Le", "Pham", "Hoang", "Huynh", "Phan", "Vu", "Vo", "Dang", "Bui", "Do", "Ho", "Ngo", "Duong", "Ly"]
MIDDLES = {"NAM": ["Van", "Duc", "Minh", "Quang", "Huu", "Anh", "Thanh", "Cong"], "NU": ["Thi", "Ngoc", "Thu", "Kim", "Bich", "Hong", "My", "Lan"]}
GIVENS = {
    "NAM": ["An", "Hung", "Dat", "Long", "Duc", "Kien", "Tai", "Nam", "Son", "Bao", "Duy", "Phat", "Thang", "Trung", "Viet", "Khang", "Hieu", "Quang", "Tuan", "Khoa"],
    "NU": ["Anh", "Huong", "Lan", "Bich", "Dieu", "Tu", "Nhung", "Yen", "Quynh", "Mai", "Trang", "Thao", "Vy", "Hanh", "Ngan", "Tram", "Uyen", "My", "Giang", "Nhi"],
}
SUBJECTS = ["Toan", "Ngu Van", "Vat Ly", "Hoa Hoc", "Sinh Hoc", "Lich Su", "Dia Ly", "Tieng Anh", "Tin Hoc", "GDCD"]
GRADES = ["10", "11"]


def gen_name(i, gender):
    surname = SURNAMES[i % len(SURNAMES)]
    return f"{surname} {random.choice(MIDDLES[gender])} {random.choice(GIVENS[gender])}"


class Command(BaseCommand):
    help = "Seed bulk demo data (admin/teachers/students/classes/assignments/grades)."

    def add_arguments(self, parser):
        parser.add_argument("--flush", action="store_true", help="Delete previously generated demo data first")

    def handle(self, *args, **options):
        random.seed(42)

        if options["flush"]:
            self._flush()
        elif Class.objects.filter(name__startswith=CLASS_PREFIX).exists():
            self.stdout.write(self.style.WARNING("Demo classes already exist. Re-run with --flush to reseed."))
            return

        with transaction.atomic():
            admin = self._ensure_admin()
            teachers = [self._ensure_user("TEACHER", i, "Teacher@123") for i in range(1, 13)]
            students = [self._ensure_user("STUDENT", i, "Student@123") for i in range(1, 81)]
            classes = self._create_classes(teachers)
            self._populate_classes(classes, students)

        self.stdout.write(self.style.SUCCESS(
            f"Seeded 1 admin, {len(teachers)} teachers, {len(students)} students, {len(classes)} classes."
        ))

    def _flush(self):
        classes = Class.objects.filter(name__startswith=CLASS_PREFIX)
        Grade.objects.filter(assignment__classroom__in=classes).delete()
        Submission.objects.filter(assignment__classroom__in=classes).delete()
        RubricCriterion.objects.filter(assignment__classroom__in=classes).delete()
        Assignment.objects.filter(classroom__in=classes).delete()
        ClassResource.objects.filter(classroom__in=classes).delete()
        Enrollment.objects.filter(classroom__in=classes).delete()
        classes.delete()

    def _ensure_admin(self):
        admin, created = User.objects.get_or_create(
            email="phong@gmail.com",
            defaults={
                "password": make_password("Admin@123"),
                "role": "ADMIN",
                "is_staff": True,
                "is_superuser": True,
                "full_name": "Nguyen Duc Phong",
                "gender": "NAM",
            },
        )
        return admin

    def _ensure_user(self, role, idx, password):
        gender = "NAM" if idx % 2 else "NU"
        email = f"{role.lower()}{idx:03d}@eduplatform.local"
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "password": make_password(password),
                "role": role,
                "full_name": gen_name(idx, gender),
                "gender": gender,
                "phone": f"{PHONE_PREFIXES[idx % len(PHONE_PREFIXES)]}{1000000 + idx * 137:07d}",
                "date_of_birth": f"{(1985 if role == 'TEACHER' else 2000) + idx % 8:04d}-{(idx % 12) + 1:02d}-{(idx % 28) + 1:02d}",
                "hometown": HOMETOWNS[idx % len(HOMETOWNS)],
                "address": f"{100 + idx} Duong Le Loi, {HOMETOWNS[idx % len(HOMETOWNS)]}",
            },
        )
        return user

    def _create_classes(self, teachers):
        now = timezone.now()
        classes = []
        for i in range(20):
            subject = SUBJECTS[i % len(SUBJECTS)]
            grade = GRADES[i % len(GRADES)]
            classroom = Class.objects.create(
                teacher=teachers[i % len(teachers)],
                name=f"{CLASS_PREFIX} {i + 1:02d} - {subject} {grade}",
                description=f"Lop {subject} khoi {grade} - du lieu demo.",
                starts_at=now - timedelta(days=60),
                ends_at=now + timedelta(days=120),
            )
            classes.append(classroom)
        return classes

    def _populate_classes(self, classes, students):
        for classroom in classes:
            roster = random.sample(students, 15)
            Enrollment.objects.bulk_create(
                [Enrollment(classroom=classroom, student=s) for s in roster]
            )

            ClassResource.objects.bulk_create([
                ClassResource(
                    classroom=classroom,
                    title=f"Tai lieu buoi {n}",
                    description=f"Tai lieu tham khao buoi hoc {n}.",
                    url=f"https://example.com/resources/class-{classroom.id}/{n}",
                )
                for n in range(1, 5)
            ])

            for n in range(1, 5):
                assignment = Assignment.objects.create(
                    classroom=classroom,
                    title=f"Bai tap {n}",
                    description=f"Noi dung bai tap {n} cho lop {classroom.name}.",
                    due_at=classroom.starts_at + timedelta(days=15 * n),
                )
                content_crit = RubricCriterion.objects.create(assignment=assignment, title="Noi dung", maximum_score=70)
                form_crit = RubricCriterion.objects.create(assignment=assignment, title="Hinh thuc", maximum_score=30)

                for student in roster:
                    if random.random() >= 0.6:
                        continue
                    submission = Submission.objects.create(
                        assignment=assignment,
                        student=student,
                        version=1,
                        file_path=f"submissions/demo/{uuid.uuid4().hex}.pdf",
                        original_filename=f"{student.full_name}_baitap{n}.pdf",
                        content_type="application/pdf",
                        size=random.randint(50_000, 500_000),
                    )

                    if random.random() >= 0.7:
                        continue
                    content_score = random.randint(int(content_crit.maximum_score * 0.6), content_crit.maximum_score)
                    form_score = random.randint(int(form_crit.maximum_score * 0.6), form_crit.maximum_score)
                    grade = Grade.objects.create(
                        assignment=assignment,
                        student=student,
                        teacher=classroom.teacher,
                        submission=submission,
                        total_score=content_score + form_score,
                        feedback="Bai lam tot, can chu y trinh bay ro rang hon.",
                    )
                    CriterionScore.objects.bulk_create([
                        CriterionScore(grade=grade, criterion=content_crit, score=content_score),
                        CriterionScore(grade=grade, criterion=form_crit, score=form_score),
                    ])
