from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.permissions import IsAuthenticated
from .models import Notification
from .serializers import NotificationSerializer


class NotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = Notification.objects.filter(recipient=request.user).order_by("-created_at", "-id")
        return Response({"unread_count": rows.filter(read_at__isnull=True).count(), "items": NotificationSerializer(rows, many=True).data})


class NotificationUnreadCountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Chỉ một COUNT(*), không nạp row nào — đó là lý do client poll được
        mỗi 30 giây mà GET /notifications thì không (07 §2.1)."""
        return Response({"unread_count": Notification.objects.filter(recipient=request.user, read_at__isnull=True).count()})


class NotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, notification_id):
        notification = get_object_or_404(Notification, id=notification_id, recipient=request.user)
        if notification.read_at is None:
            notification.read_at = timezone.now(); notification.save(update_fields=("read_at",))
        return Response(NotificationSerializer(notification).data)


class NotificationReadAllView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Một queryset update() thay vì loop POST /{id}/read: không nạp row nào,
        không có lỗi từng-row để hỏng nửa chừng. Mệnh đề WHERE đã mang guard
        read_at IS NULL nên không cần kiểm trong Python (07 §3)."""
        Notification.objects.filter(recipient=request.user, read_at__isnull=True).update(read_at=timezone.now())
        return Response({"unread_count": 0})
