import hashlib

from django.core.cache import cache


def _key(kind, value):
    return f"password-reset:{kind}:{hashlib.sha256(value.encode()).hexdigest()}"


def allow_password_reset(email, remote_addr):
    email_key = _key("email", email.strip().lower())
    ip_key = _key("ip", remote_addr or "")
    if cache.get(email_key) is not None or cache.get(ip_key, 0) >= 5:
        return False
    cache.set(email_key, True, timeout=60)
    if cache.add(ip_key, 1, timeout=3600):
        return True
    cache.incr(ip_key)
    return True
