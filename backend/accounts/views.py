import hashlib

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from audit.services import write_audit

from .mail import send_password_reset_email
from .models import PasswordResetToken, User
from .permissions import IsAdmin, IsAuthenticated
from .serializers import (
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    LoginSerializer,
    ResetPasswordSerializer,
    SelfProfileSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
)
from .services import consume_reset_token, issue_reset_token
from .throttling import allow_password_reset


class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class = LoginSerializer


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        if serializer.is_valid() and allow_password_reset(
            serializer.validated_data["email"], request.META.get("REMOTE_ADDR", "")
        ):
            user = User.objects.filter(
                email=serializer.validated_data["email"], is_active=True, is_deleted=False,
                role__in=(User.Role.TEACHER, User.Role.STUDENT),
            ).first()
            if user:
                send_password_reset_email(user, issue_reset_token(user))
        return Response(status=status.HTTP_204_NO_CONTENT)


class ResetPasswordPreflightView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        token = PasswordResetToken.objects.filter(token_hash=hashlib.sha256(token.encode()).hexdigest()).first()
        if token is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if token.used_at or token.expires_at <= timezone.now():
            return Response(status=status.HTTP_410_GONE)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        result = consume_reset_token(
            serializer.validated_data["token"],
            serializer.validated_data["new_password"],
            serializer.validated_data["confirm_new_password"],
        )
        if result == "ok":
            return Response(status=status.HTTP_204_NO_CONTENT)
        if result == "unknown":
            return Response(status=status.HTTP_404_NOT_FOUND)
        if result in ("expired", "used"):
            return Response(status=status.HTTP_410_GONE)
        return Response({"new_password": ["Invalid password."]}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = SelfProfileSerializer(request.user, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        with transaction.atomic():
            user = serializer.save()
            write_audit(
                actor=request.user,
                action="account.self_updated",
                target=user,
                metadata=account_metadata(user),
            )
        return Response(UserSerializer(user).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(request.user, data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        with transaction.atomic():
            request.user.set_password(serializer.validated_data["new_password"])
            request.user.must_change_password = False
            request.user.save(update_fields=("password", "must_change_password"))
            write_audit(
                actor=request.user,
                action="account.password_changed",
                target=request.user,
                metadata={},
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class UsersView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        users = User.objects.filter(
            is_active=True, role__in=(User.Role.TEACHER, User.Role.STUDENT)
        )
        if query := request.query_params.get("q", "").strip():
            users = users.filter(Q(full_name__icontains=query) | Q(email__icontains=query))
        if role := request.query_params.get("role", ""):
            if role not in (User.Role.TEACHER, User.Role.STUDENT):
                return Response({"role": ["Choose Teacher or Student."]}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
            users = users.filter(role=role)
        return Response(UserSerializer(users.order_by("id"), many=True).data)

    def post(self, request):
        serializer = UserCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        with transaction.atomic():
            user = serializer.save()
            write_audit(
                actor=request.user,
                action="account.created",
                target=user,
                metadata=account_metadata(user),
            )
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class UserDetailView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, user_id):
        user = get_object_or_404(
            User.objects.filter(
                is_active=True, role__in=(User.Role.TEACHER, User.Role.STUDENT)
            ),
            id=user_id,
        )
        serializer = UserUpdateSerializer(user, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        with transaction.atomic():
            user = serializer.save()
            write_audit(
                actor=request.user,
                action="account.updated",
                target=user,
                metadata=account_metadata(user),
            )
        return Response(UserSerializer(user).data)

    def delete(self, request, user_id):
        user = get_object_or_404(
            User.objects.filter(
                is_active=True, role__in=(User.Role.TEACHER, User.Role.STUDENT)
            ),
            id=user_id,
        )
        if user.classes.filter(ends_at__gt=timezone.now()).exists() or user.enrollments.filter(classroom__ends_at__gt=timezone.now()).exists():
            return Response(
                {"detail": "Accounts assigned to or enrolled in an active Class cannot be deactivated."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        with transaction.atomic():
            user.is_active = False
            user.save(update_fields=("is_active",))
            write_audit(
                actor=request.user,
                action="account.deactivated",
                target=user,
                metadata=account_metadata(user),
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


def account_metadata(user):
    metadata = {
        field: getattr(user, field)
        for field in ("full_name", "email", "role", "phone", "date_of_birth", "gender", "address", "is_active")
    }
    if metadata["date_of_birth"]:
        metadata["date_of_birth"] = metadata["date_of_birth"].isoformat()
    return metadata
