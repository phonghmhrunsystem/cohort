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


class NotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, notification_id):
        notification = get_object_or_404(Notification, id=notification_id, recipient=request.user)
        if notification.read_at is None:
            notification.read_at = timezone.now(); notification.save(update_fields=("read_at",))
        return Response(NotificationSerializer(notification).data)
