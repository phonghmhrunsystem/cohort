from rest_framework.permissions import IsAuthenticated as DRFIsAuthenticated


class IsAuthenticated(DRFIsAuthenticated):
    allowed_while_forced = {"/api/auth/me", "/api/auth/change-password", "/api/auth/logout"}

    def has_permission(self, request, view):
        return super().has_permission(request, view) and (
            not request.user.must_change_password or request.path in self.allowed_while_forced
        )
