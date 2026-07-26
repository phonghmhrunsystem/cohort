from pathlib import PurePosixPath, PureWindowsPath

from django.db import transaction

from .models import AuditLog

_SKIP = object()


def safe_metadata(metadata):
    return _safe_value(metadata)


def _safe_value(value):
    if isinstance(value, bytes) or (
        isinstance(value, str)
        and (PurePosixPath(value).is_absolute() or PureWindowsPath(value).is_absolute())
    ):
        return _SKIP
    if isinstance(value, dict):
        clean = {}
        for key, item in value.items():
            if any(secret in key.lower() for secret in ("password", "token", "secret", "authorization", "jwt", "access", "refresh")):
                continue
            item = _safe_value(item)
            if item is not _SKIP:
                clean[key] = item
        return clean
    if isinstance(value, (list, tuple)):
        return [item for item in (_safe_value(item) for item in value) if item is not _SKIP]
    return value


@transaction.atomic
def write_audit(*, actor, action, target, metadata):
    return AuditLog.objects.create(
        actor=actor,
        action=action,
        target_type=target._meta.label_lower,
        target_id=target.pk,
        metadata=safe_metadata(metadata),
    )
