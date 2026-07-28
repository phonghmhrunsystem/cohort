from django.db import migrations


def backfill_full_name(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    for user in User.objects.filter(role__in=("TEACHER", "STUDENT")):
        if not user.full_name or not user.full_name.strip():
            user.full_name = user.email.split("@", 1)[0].replace(".", " ").title()
            user.save(update_fields=("full_name",))


class Migration(migrations.Migration):
    dependencies = [("accounts", "0003_user_profile")]

    operations = [migrations.RunPython(backfill_full_name, migrations.RunPython.noop)]
