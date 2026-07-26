from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from audit.services import write_audit

from .models import User
from .serializers import UserCreateSerializer, UserSerializer, UserUpdateSerializer


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == User.Role.ADMIN


class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class UsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role == User.Role.TEACHER:
            return Response(UserSerializer(User.objects.filter(role=User.Role.STUDENT).order_by("id"), many=True).data)
        if request.user.role != User.Role.ADMIN:
            return Response(status=status.HTTP_403_FORBIDDEN)
        return Response(UserSerializer(User.objects.order_by("id"), many=True).data)

    def post(self, request):
        if request.user.role != User.Role.ADMIN:
            return Response(status=status.HTTP_403_FORBIDDEN)
        serializer = UserCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        with transaction.atomic():
            user = User.objects.create_user(
                serializer.validated_data["email"],
                serializer.validated_data["password"],
                role=serializer.validated_data["role"],
                is_active=serializer.validated_data.get("is_active", True),
            )
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
        user = get_object_or_404(User, id=user_id)
        serializer = UserUpdateSerializer(user, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        with transaction.atomic():
            serializer.save()
            write_audit(
                actor=request.user,
                action="account.updated",
                target=user,
                metadata=account_metadata(user),
            )
        return Response(UserSerializer(user).data)


def account_metadata(user):
    return {field: getattr(user, field) for field in ("email", "role", "is_active")}
