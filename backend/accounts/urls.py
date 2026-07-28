from django.urls import path

from .views import ChangePasswordView, LoginView, LogoutView, MeView, PasswordResetRequestView, PasswordResetResolveView, UserDetailView, UsersView


urlpatterns = [
    path("auth/login", LoginView.as_view()),
    path("password-reset-requests", PasswordResetRequestView.as_view()),
    path("password-reset-requests/<int:request_id>/resolve", PasswordResetResolveView.as_view()),
    path("auth/logout", LogoutView.as_view()),
    path("auth/me", MeView.as_view()),
    path("auth/change-password", ChangePasswordView.as_view()),
    path("users", UsersView.as_view()),
    path("users/<int:user_id>", UserDetailView.as_view()),
]
