from django.contrib.auth.hashers import make_password
from django.db import migrations

from accounts.seed_data import build_roster


def seed_demo_data(apps, schema_editor):
    User = apps.get_model("accounts", "User")

    for entry in build_roster():
        User.objects.get_or_create(
            email=entry["email"],
            defaults={
                "password": make_password(entry["password"]),
                "role": entry["role"],
                "is_staff": entry["role"] == "ADMIN",
                "is_superuser": entry["role"] == "ADMIN",
            },
        )


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]
    operations = [migrations.RunPython(seed_demo_data, migrations.RunPython.noop)]
