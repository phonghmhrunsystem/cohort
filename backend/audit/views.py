from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from .labels import resolve_labels
from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        # ponytail: bảng chỉ tăng, chưa bao giờ xoá — thêm ?page khi log thật đủ dài.
        logs = list(AuditLog.objects.select_related("actor"))
        return Response(AuditLogSerializer(logs, many=True, context={"labels": resolve_labels(logs)}).data)
