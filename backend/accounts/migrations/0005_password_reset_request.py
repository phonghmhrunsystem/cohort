from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [("accounts", "0004_backfill_full_name")]

    operations = [
        migrations.AddField(
            model_name="user", name="must_change_password", field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name="PasswordResetRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("requested_at", models.DateTimeField(auto_now_add=True)),
                ("status", models.CharField(choices=[("PENDING", "Pending"), ("RESOLVED", "Resolved")], default="PENDING", max_length=8)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                ("resolver", models.ForeignKey(blank=True, null=True, on_delete=models.deletion.PROTECT, related_name="resolved_password_reset_requests", to="accounts.user")),
                ("user", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="password_reset_requests", to="accounts.user")),
            ],
        ),
        migrations.AddConstraint(
            model_name="passwordresetrequest",
            constraint=models.UniqueConstraint(condition=Q(("status", "PENDING")), fields=("user",), name="one_pending_password_reset_per_user"),
        ),
    ]
