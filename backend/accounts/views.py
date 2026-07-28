from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from audit.services import write_audit

from .models import PasswordResetRequest, User
from .permissions import IsAuthenticated
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    PasswordResetRequestSerializer,
    PasswordResetResolveSerializer,
    SelfProfileSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
)


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and not request.user.must_change_password and request.user.role == User.Role.ADMIN


class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class = LoginSerializer


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if serializer.is_valid():
            user = User.objects.filter(
                email=serializer.validated_data["email"], is_active=True,
                role__in=(User.Role.TEACHER, User.Role.STUDENT),
            ).first()
            if user:
                PasswordResetRequest.objects.get_or_create(
                    user=user, status=PasswordResetRequest.Status.PENDING
                )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get(self, request):
        if not request.user.is_authenticated or request.user.role != User.Role.ADMIN:
            return Response(status=status.HTTP_403_FORBIDDEN)
        rows = PasswordResetRequest.objects.filter(status=PasswordResetRequest.Status.PENDING).select_related("user")
        return Response([{"id": row.id, "email": row.user.email, "requested_at": row.requested_at} for row in rows])


class PasswordResetResolveView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, request_id):
        serializer = PasswordResetResolveSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        with transaction.atomic():
            reset = get_object_or_404(PasswordResetRequest.objects.select_for_update(), id=request_id)
            if reset.status != PasswordResetRequest.Status.PENDING:
                return Response(status=status.HTTP_422_UNPROCESSABLE_ENTITY)
            user = reset.user
            user.set_password(serializer.validated_data["password"])
            user.must_change_password = True
            user.save(update_fields=("password", "must_change_password"))
            reset.status = PasswordResetRequest.Status.RESOLVED
            reset.resolver = request.user
            reset.resolved_at = timezone.now()
            reset.save(update_fields=("status", "resolver", "resolved_at"))
            write_audit(actor=request.user, action="account.password_reset_resolved", target=user, metadata={})
        return Response(status=status.HTTP_204_NO_CONTENT)


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
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.ADMIN:
            return Response(status=status.HTTP_403_FORBIDDEN)
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
        if request.user.role != User.Role.ADMIN:
            return Response(status=status.HTTP_403_FORBIDDEN)
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
