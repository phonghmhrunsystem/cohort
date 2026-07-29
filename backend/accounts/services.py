import hashlib
import secrets
from datetime import timedelta

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from audit.services import write_audit
from classes.models import Class, Enrollment

from .models import PasswordResetToken, User


def manageable_users():
    return User.objects.filter(
        is_deleted=False,
        role__in=(User.Role.TEACHER, User.Role.STUDENT),
    )


def has_active_class(user):
    now = timezone.now()
    return (
        Class.objects.filter(teacher=user, is_active=True, ends_at__gt=now).exists()
        or Enrollment.objects.filter(student=user, classroom__is_active=True, classroom__ends_at__gt=now).exists()
    )


def _token_hash(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


def issue_reset_token(user):
    now = timezone.now()
    raw = secrets.token_urlsafe(32)
    with transaction.atomic():
        User.objects.select_for_update().get(pk=user.pk)
        tokens = list(
            PasswordResetToken.objects.select_for_update().filter(
                user=user, used_at__isnull=True, expires_at__gt=now
            )
        )
        for token in tokens:
            token.used_at = now
            token.save(update_fields=("used_at",))
        PasswordResetToken.objects.create(
            user=user,
            token_hash=_token_hash(raw),
            expires_at=now + timedelta(minutes=30),
        )
    return raw


def consume_reset_token(raw, new_password, confirm_password):
    with transaction.atomic():
        try:
            token = PasswordResetToken.objects.select_for_update().select_related("user").get(token_hash=_token_hash(raw))
        except PasswordResetToken.DoesNotExist:
            return "unknown"

        now = timezone.now()
        if token.used_at:
            return "used"
        if token.expires_at <= now:
            return "expired"
        if new_password != confirm_password:
            return "invalid"
        try:
            validate_password(new_password, token.user)
        except ValidationError:
            return "invalid"

        token.user.set_password(new_password)
        token.user.save(update_fields=("password",))
        token.used_at = now
        token.save(update_fields=("used_at",))
        write_audit(actor=token.user, action="account.password_changed", target=token.user, metadata={})
    return "ok"
