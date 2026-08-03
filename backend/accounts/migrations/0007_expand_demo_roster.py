"""Move the demo roster onto `annv@`-style addresses and grow it to 10 Teachers
and 80 Students.

An existing database already holds the 46 accounts seeded by 0002/0006 under the
old `nguyen.van.an@` addresses. Renaming has to happen before the insert, or the
new roster entry and the old row would both claim the same person.
"""
from django.contrib.auth.hashers import make_password
from django.db import migrations

from accounts.seed_data import build_roster, legacy_email

# 0002 hard-coded the admin address; it does not follow the legacy name slug.
LEGACY_ADMIN_EMAIL = "phong@gmail.com"


def expand_roster(apps, schema_editor):
    User = apps.get_model("accounts", "User")

    for entry in build_roster():
        old = LEGACY_ADMIN_EMAIL if entry["role"] == "ADMIN" else legacy_email(entry["full_name"])
        if old != entry["email"] and not User.objects.filter(email=entry["email"]).exists():
            User.objects.filter(email=old).update(email=entry["email"])

        User.objects.update_or_create(
            email=entry["email"],
            defaults={
                "role": entry["role"],
                "full_name": entry["full_name"],
                "gender": entry["gender"],
                "phone": entry["phone"],
                "date_of_birth": entry["date_of_birth"],
                "hometown": entry["hometown"],
                "address": entry["address"],
                "is_staff": entry["role"] == "ADMIN",
                "is_superuser": entry["role"] == "ADMIN",
            },
            create_defaults={
                "password": make_password(entry["password"]),
                "role": entry["role"],
                "full_name": entry["full_name"],
                "gender": entry["gender"],
                "phone": entry["phone"],
                "date_of_birth": entry["date_of_birth"],
                "hometown": entry["hometown"],
                "address": entry["address"],
                "is_staff": entry["role"] == "ADMIN",
                "is_superuser": entry["role"] == "ADMIN",
            },
        )


class Migration(migrations.Migration):
    dependencies = [("accounts", "0006_seed_full_profiles")]
    operations = [migrations.RunPython(expand_roster, migrations.RunPython.noop)]
