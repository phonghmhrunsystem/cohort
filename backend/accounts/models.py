from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.db.models import Q


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("An email address is required.")
        user = self.model(email=email.strip().lower(), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", User.Role.ADMIN)
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "ADMIN"
        TEACHER = "TEACHER"
        STUDENT = "STUDENT"

    username = None
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=7, choices=Role.choices)
    full_name = models.CharField(max_length=100, null=True, blank=True)
    phone = models.CharField(max_length=16, null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=4, null=True, blank=True)
    hometown = models.CharField(max_length=100, null=True, blank=True)
    address = models.CharField(max_length=255, null=True, blank=True)
    must_change_password = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()


class PasswordResetRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING"
        RESOLVED = "RESOLVED"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="password_reset_requests")
    requested_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    resolver = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="resolved_password_reset_requests")
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("user",), condition=Q(status="PENDING"), name="one_pending_password_reset_per_user"
            )
        ]


class PasswordResetToken(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="password_reset_tokens")
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)
    used_at = models.DateTimeField(null=True, blank=True)
