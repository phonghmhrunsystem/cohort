from rest_framework.permissions import BasePermission, IsAuthenticated as DRFIsAuthenticated

from .models import User


class IsAuthenticated(DRFIsAuthenticated):
    allowed_while_forced = {"/api/auth/me", "/api/auth/change-password", "/api/auth/logout"}

    def has_permission(self, request, view):
        return super().has_permission(request, view) and (
            not request.user.must_change_password or request.path in self.allowed_while_forced
        )


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and not request.user.must_change_password and request.user.role == User.Role.ADMIN
