from django.conf import settings
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True
    dependencies = [("accounts", "0005_auth_lifecycle")]
    operations = [migrations.CreateModel(name="Notification", fields=[("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")), ("type", models.CharField(max_length=32)), ("title", models.CharField(max_length=200)), ("link", models.CharField(max_length=255)), ("created_at", models.DateTimeField(auto_now_add=True)), ("read_at", models.DateTimeField(blank=True, null=True)), ("recipient", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="notifications", to=settings.AUTH_USER_MODEL))])]
