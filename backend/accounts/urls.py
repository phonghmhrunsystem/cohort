from django.urls import path

from .views import LoginView, MeView, UserDetailView, UsersView


urlpatterns = [
    path("auth/login", LoginView.as_view()),
    path("auth/me", MeView.as_view()),
    path("users", UsersView.as_view()),
    path("users/<int:user_id>", UserDetailView.as_view()),
]
