from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission
from core.security import decode_access_token
from core.redis_client import get_session, save_session
from django.conf import settings
import logging

class JWTAuthentication(BaseAuthentication):
    def authenticate(self, request):
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return None

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return None

        token = parts[1]
        email = decode_access_token(token)
        if not email:
            raise AuthenticationFailed("Could not validate credentials")

        # Session tracking fallback / refresh in Redis
        try:
            session_data = get_session(token)
            if session_data is None:
                save_session(token, email, settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        except Exception as e:
            logging.error(f"Redis session check error: {e}")

        # Fetch user model dynamically to prevent circular imports
        from auth_app.models import User
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise AuthenticationFailed("User not found")

        # Attach raw token to request for logout endpoint access
        request.token = token
        return (user, token)

class RoleChecker(BasePermission):
    """
    DRF permission class that verifies user role.
    Usage: permission_classes = [RoleChecker(['admin'])]
    """
    def __init__(self, allowed_roles=None):
        self.allowed_roles = allowed_roles or []

    def has_permission(self, request, view):
        if not request.user:
            return False
        allowed = getattr(view, 'allowed_roles', self.allowed_roles)
        return request.user.role in allowed
