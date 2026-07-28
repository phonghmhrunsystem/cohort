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
    teacher_anh = user("teacher.anh@example.com", "Teacher@123", "TEACHER", first_name="Teacher", last_name="Anh")
    teacher_binh = user("teacher.binh@example.com", "Teacher@123", "TEACHER", first_name="Teacher", last_name="Binh")
    student_an = user("student.an@example.com", "Student@123", "STUDENT", first_name="Student", last_name="An")
    student_bao = user("student.bao@example.com", "Student@123", "STUDENT", first_name="Student", last_name="Bao")
    student_chi = user("student.chi@example.com", "Student@123", "STUDENT", first_name="Student", last_name="Chi")
    student_dung = user("student.dung@example.com", "Student@123", "STUDENT", first_name="Student", last_name="Dung")

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
