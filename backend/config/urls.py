from django.http import JsonResponse
from django.urls import include, path

from accounts import urls as account_urls
from audit import urls as audit_urls
from classes import urls as class_urls

urlpatterns = [
    path("api/health", lambda request: JsonResponse({"status": "ok"})),
    path("api/", include(account_urls)),
    path("api/", include(audit_urls)),
    path("api/", include(class_urls)),
]
