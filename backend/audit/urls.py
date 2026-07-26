from django.urls import path

from .views import AuditLogView


urlpatterns = [path("audit-logs", AuditLogView.as_view())]
