from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(AuditLogSerializer(AuditLog.objects.all(), many=True).data)
