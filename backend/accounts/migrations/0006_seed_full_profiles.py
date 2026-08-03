from django.db import migrations

from accounts.seed_data import build_roster


def seed_full_profiles(apps, schema_editor):
    User = apps.get_model("accounts", "User")

    for entry in build_roster():
        User.objects.filter(email=entry["email"]).update(
            full_name=entry["full_name"],
            gender=entry["gender"],
            phone=entry["phone"],
            date_of_birth=entry["date_of_birth"],
            hometown=entry["hometown"],
            address=entry["address"],
        )


class Migration(migrations.Migration):
    dependencies = [("accounts", "0005_auth_lifecycle")]
    operations = [migrations.RunPython(seed_full_profiles, migrations.RunPython.noop)]
