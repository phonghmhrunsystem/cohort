import hashlib

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from audit.services import write_audit

from .mail import send_password_reset_email
from .models import PasswordResetToken, User
from .permissions import IsAdmin, IsAuthenticated
from .serializers import (
    AdminResetPasswordSerializer,
    AdminUserSerializer,
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    LoginSerializer,
    ResetPasswordSerializer,
    SelfProfileSerializer,
    UserCreateSerializer,
    UserListFilterSerializer,
    UserSerializer,
    UserStatusSerializer,
    UserUpdateSerializer,
)
from .services import consume_reset_token, has_active_class, issue_reset_token, manageable_users
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
        filters = UserListFilterSerializer(data=request.query_params)
        if not filters.is_valid():
            return Response(filters.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        values = filters.validated_data
        users = manageable_users()
        if query := values.get("q", "").strip():
            users = users.filter(Q(full_name__icontains=query) | Q(email__icontains=query))
        if role := values.get("role"):
            users = users.filter(role=role)
        for field in ("created", "updated"):
            if value := values.get(f"{field}_from"):
                users = users.filter(**{f"{field}_at__date__gte": value})
            if value := values.get(f"{field}_to"):
                users = users.filter(**{f"{field}_at__date__lte": value})
        paginator = PageNumberPagination()
        paginator.page_size = 10
        page = paginator.paginate_queryset(users.order_by("-updated_at", "-id"), request)
        return paginator.get_paginated_response(AdminUserSerializer(page, many=True).data)

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
        return Response(AdminUserSerializer(user).data, status=status.HTTP_201_CREATED)


class UserDetailView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, user_id):
        return Response(AdminUserSerializer(get_object_or_404(manageable_users(), id=user_id)).data)

    def patch(self, request, user_id):
        user = get_object_or_404(manageable_users(), id=user_id)
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
        return Response(AdminUserSerializer(user).data)

    def delete(self, request, user_id):
        user = get_object_or_404(manageable_users(), id=user_id)
        blocked = active_class_response(user)
        if blocked:
            return blocked
        with transaction.atomic():
            user.is_active = False
            user.is_deleted = True
            user.save(update_fields=("is_active", "is_deleted"))
            write_audit(
                actor=request.user,
                action="account.deleted",
                target=user,
                metadata=account_metadata(user),
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserStatusView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, user_id):
        user = get_object_or_404(manageable_users(), id=user_id)
        serializer = UserStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        is_active = serializer.validated_data["is_active"]
        if user.is_active == is_active:
            return Response(
                {"is_active": ["Provide a changed status."]},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        if user.is_active and not is_active:
            blocked = active_class_response(user)
            if blocked:
                return blocked
        with transaction.atomic():
            user.is_active = is_active
            user.save(update_fields=("is_active",))
            write_audit(
                actor=request.user,
                action="account.reactivated" if is_active else "account.deactivated",
                target=user,
                metadata=account_metadata(user),
            )
        return Response(AdminUserSerializer(user).data)


class UserResetPasswordView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, user_id):
        user = get_object_or_404(manageable_users(), id=user_id)
        serializer = AdminResetPasswordSerializer(user, data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        with transaction.atomic():
            user.set_password(serializer.validated_data["new_password"])
            user.must_change_password = True
            user.save(update_fields=("password", "must_change_password"))
            write_audit(
                actor=request.user,
                action="account.password_set",
                target=user,
                metadata=account_metadata(user),
            )
        return Response(AdminUserSerializer(user).data)


def active_class_response(user):
    if not has_active_class(user):
        return None
    return Response(
        {"detail": "Accounts assigned to or enrolled in an active Class cannot be disabled or deleted."},
        status=status.HTTP_422_UNPROCESSABLE_ENTITY,
    )


def account_metadata(user):
    return {
        "user_id": user.id,
        "role": user.role,
        "is_active": user.is_active,
        "is_deleted": user.is_deleted,
        "must_change_password": user.must_change_password,
    }
