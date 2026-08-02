from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAuthenticated


class DashboardView(APIView):
    """Một endpoint, ba hình payload. Role đọc từ `request.user`, không bao giờ
    từ query param — payload là thứ người gọi *được phép* thấy, không phải thứ
    họ xin."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"role": request.user.role})
