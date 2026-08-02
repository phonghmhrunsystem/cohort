from django.urls import path
from .views import NotificationReadAllView, NotificationReadView, NotificationsView, NotificationUnreadCountView
urlpatterns = [
    path("notifications", NotificationsView.as_view()),
    path("notifications/unread-count", NotificationUnreadCountView.as_view()),
    path("notifications/read-all", NotificationReadAllView.as_view()),
    path("notifications/<int:notification_id>/read", NotificationReadView.as_view()),
]
