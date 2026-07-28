from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User

from .models import AuditLog
from .serializers import AuditLogSerializer


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and not request.user.must_change_password and request.user.role == User.Role.ADMIN


class AuditLogView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(AuditLogSerializer(AuditLog.objects.all(), many=True).data)
