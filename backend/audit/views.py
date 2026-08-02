from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from .labels import resolve_labels
from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        # Bảng chỉ tăng, chưa bao giờ xoá: trả cả log là không bền, nên cắt trang
        # 10 dòng như các list khác. Nhãn chỉ phân giải cho trang hiện tại.
        paginator = PageNumberPagination()
        paginator.page_size = 10
        logs = paginator.paginate_queryset(AuditLog.objects.select_related("actor"), request)
        data = AuditLogSerializer(logs, many=True, context={"labels": resolve_labels(logs)}).data
        return Response(paginator.get_paginated_response(data).data)
