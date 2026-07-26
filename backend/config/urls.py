from django.http import JsonResponse
from django.urls import path

urlpatterns = [path("api/health", lambda request: JsonResponse({"status": "ok"}))]
