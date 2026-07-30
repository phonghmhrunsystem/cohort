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
