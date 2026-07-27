from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("classes", "0001_initial"),
        ("cohorts", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.DeleteModel(name="Enrollment"),
                migrations.DeleteModel(name="Cohort"),
            ],
        )
    ]
