from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("classes", "0001_initial")]
    operations = [migrations.CreateModel(name="ClassResource", fields=[("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")), ("title", models.CharField(max_length=150)), ("description", models.TextField(blank=True, max_length=1000)), ("url", models.URLField(max_length=2048)), ("classroom", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="resources", to="classes.class"))])]
