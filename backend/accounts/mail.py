from urllib.parse import urlencode

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction


def send_password_reset_email(user, raw):
    link = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?{urlencode({'token': raw})}"
    if settings.DEBUG:
        # Console/SMTP bodies are quoted-printable and soft-wrapped at 76 cols, which
        # splits the link mid-token. Print the raw link so it can be copied in dev.
        print(f"[dev] password reset link for {user.email}: {link}")
    transaction.on_commit(
        lambda: send_mail(
            "Reset your password",
            f"Use this link to reset your password: {link}",
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
        )
    )
