from django.urls import path

from .views import ChangePasswordView, ForgotPasswordView, LoginView, LogoutView, MeView, ResetPasswordPreflightView, ResetPasswordView, UserDetailView, UsersView


urlpatterns = [
    path("auth/login", LoginView.as_view()),
    path("auth/logout", LogoutView.as_view()),
    path("auth/me", MeView.as_view()),
    path("auth/change-password", ChangePasswordView.as_view()),
    path("auth/forgot-password", ForgotPasswordView.as_view()),
    path("auth/reset-password/<str:token>", ResetPasswordPreflightView.as_view()),
    path("auth/reset-password", ResetPasswordView.as_view()),
    path("users", UsersView.as_view()),
    path("users/<int:user_id>", UserDetailView.as_view()),
]
