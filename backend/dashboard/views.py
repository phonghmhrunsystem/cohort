from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsAuthenticated

from .serializers import AdminDashboardSerializer, StudentDashboardSerializer, TeacherDashboardSerializer
from .services import admin_dashboard, student_dashboard, teacher_dashboard

_BY_ROLE = {
    User.Role.ADMIN: (admin_dashboard, AdminDashboardSerializer),
    User.Role.TEACHER: (teacher_dashboard, TeacherDashboardSerializer),
    User.Role.STUDENT: (student_dashboard, StudentDashboardSerializer),
}


class DashboardView(APIView):
    """Một endpoint, ba hình payload. Role đọc từ `request.user`, không bao giờ
    từ query param — payload là thứ người gọi *được phép* thấy, không phải thứ
    họ xin."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        build, serializer_class = _BY_ROLE[request.user.role]
        return Response(serializer_class(build(request.user)).data)
