from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsAuthenticated

from .serializers import AdminDashboardSerializer, TeacherDashboardSerializer
from .services import admin_dashboard, teacher_dashboard


class DashboardView(APIView):
    """Một endpoint, ba hình payload. Role đọc từ `request.user`, không bao giờ
    từ query param — payload là thứ người gọi *được phép* thấy, không phải thứ
    họ xin."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role == User.Role.ADMIN:
            return Response(AdminDashboardSerializer(admin_dashboard(request.user)).data)
        if request.user.role == User.Role.TEACHER:
            return Response(TeacherDashboardSerializer(teacher_dashboard(request.user)).data)
        return Response({"role": request.user.role})
