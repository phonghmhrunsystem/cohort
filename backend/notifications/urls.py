from django.urls import path
from .views import NotificationReadAllView, NotificationReadView, NotificationsView
urlpatterns = [
    path("notifications", NotificationsView.as_view()),
    path("notifications/read-all", NotificationReadAllView.as_view()),
    path("notifications/<int:notification_id>/read", NotificationReadView.as_view()),
]
