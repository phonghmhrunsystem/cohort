from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from audit.services import write_audit

from .models import User
from .serializers import LoginSerializer, UserCreateSerializer, UserSerializer, UserUpdateSerializer


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == User.Role.ADMIN


class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class = LoginSerializer


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


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
                action="account.password_reset" if set(serializer.validated_data) == {"new_password"} else "account.updated",
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
        if user.cohorts.exists() or user.enrollments.exists():
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
