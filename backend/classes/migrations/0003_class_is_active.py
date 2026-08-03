from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("classes", "0002_classresource")]

    operations = [
        migrations.AddField(
            model_name="class",
            name="is_active",
            field=models.BooleanField(default=True),
        ),
    ]
