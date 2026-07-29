from urllib.parse import urlencode

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction


def send_password_reset_email(user, raw):
    link = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?{urlencode({'token': raw})}"
    transaction.on_commit(
        lambda: send_mail(
            "Reset your password",
            f"Use this link to reset your password: {link}",
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
        )
    )
