from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("accounts", "0006_auth_lifecycle")]

    operations = [migrations.DeleteModel(name="PasswordResetRequest")]
