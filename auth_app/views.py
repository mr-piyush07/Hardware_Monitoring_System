from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
from auth_app.models import User
from core.security import get_password_hash, verify_password, create_access_token
from core.redis_client import save_session, delete_session
from core.authentication import RoleChecker
import json

def serialize_user(user):
    try:
        perms = json.loads(user.permissions)
    except (json.JSONDecodeError, TypeError):
        perms = []
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "permissions": perms,
    }

@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    data = request.data
    email = data.get("email")
    password = data.get("password")
    full_name = data.get("full_name")
    role = data.get("role", "user")

    if not email or not password:
        return Response({"detail": "Email and password are required"}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(email=email).exists():
        return Response({"detail": "Email already registered"}, status=status.HTTP_400_BAD_REQUEST)

    # Auto-promote first user to admin
    if User.objects.count() == 0:
        role = "admin"

    hashed_pw = get_password_hash(password)
    user = User.objects.create(
        email=email,
        hashed_password=hashed_pw,
        full_name=full_name,
        role=role
    )
    return Response(serialize_user(user), status=status.HTTP_201_CREATED)

@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    username = request.data.get("username") or request.data.get("email")
    password = request.data.get("password")

    if not username or not password:
        return Response({"detail": "Username and password required"}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.filter(email=username).first()
    if not user or not verify_password(password, user.hashed_password):
        return Response(
            {"detail": "Incorrect username or password"},
            status=status.HTTP_401_UNAUTHORIZED
        )

    access_token = create_access_token(subject=user.email)

    try:
        save_session(
            token=access_token,
            email=user.email,
            expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    except Exception:
        pass

    return Response({
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role,
        "full_name": user.full_name,
        "permissions": user.get_permissions_list()
    })

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    token = getattr(request, "token", None)
    if token:
        try:
            delete_session(token)
        except Exception:
            pass
    return Response({"message": "Successfully logged out"})

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_users(request):
    checker = RoleChecker(["admin", "subadmin"])
    if not checker.has_permission(request, None):
        return Response({"detail": "You do not have enough permissions to perform this action"}, status=status.HTTP_403_FORBIDDEN)

    users = User.objects.all()
    return Response([serialize_user(u) for u in users])

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def admin_create_user(request):
    checker = RoleChecker(["admin", "subadmin"])
    if not checker.has_permission(request, None):
        return Response({"detail": "You do not have enough permissions to perform this action"}, status=status.HTTP_403_FORBIDDEN)

    data = request.data
    email = data.get("email")
    password = data.get("password")
    full_name = data.get("full_name", "")
    role = data.get("role", "user")
    permissions = data.get("permissions", [])

    if not email or not password:
        return Response({"detail": "Email and password are required"}, status=status.HTTP_400_BAD_REQUEST)

    if role not in ("user", "subadmin", "admin"):
        return Response({"detail": "Invalid role"}, status=status.HTTP_400_BAD_REQUEST)

    # Sub-admin cannot create admin users
    if request.user.role == "subadmin" and role == "admin":
        return Response({"detail": "Sub-admin cannot create admin users"}, status=status.HTTP_403_FORBIDDEN)

    if User.objects.filter(email=email).exists():
        return Response({"detail": "Email already registered"}, status=status.HTTP_400_BAD_REQUEST)

    hashed_pw = get_password_hash(password)
    user = User.objects.create(
        email=email,
        hashed_password=hashed_pw,
        full_name=full_name,
        role=role
    )
    user.set_permissions_list(permissions or [])
    user.save()

    return Response(serialize_user(user), status=status.HTTP_201_CREATED)

@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_user(request, user_id):
    checker = RoleChecker(["admin", "subadmin"])
    if not checker.has_permission(request, None):
        return Response({"detail": "You do not have enough permissions to perform this action"}, status=status.HTTP_403_FORBIDDEN)

    user = User.objects.filter(id=user_id).first()
    if not user:
        return Response({"detail": "User not found"}, status=status.HTTP_404_NOT_FOUND)

    # Sub-admin cannot modify admin users
    if request.user.role == "subadmin" and user.role == "admin":
        return Response({"detail": "Sub-admin cannot modify admin users"}, status=status.HTTP_403_FORBIDDEN)

    data = request.data

    if "role" in data:
        new_role = data["role"]
        if new_role not in ("user", "subadmin", "admin"):
            return Response({"detail": "Invalid role"}, status=status.HTTP_400_BAD_REQUEST)
        if request.user.role == "subadmin" and new_role == "admin":
            return Response({"detail": "Sub-admin cannot promote to admin"}, status=status.HTTP_403_FORBIDDEN)
        user.role = new_role

    if "full_name" in data:
        user.full_name = data["full_name"]

    if "password" in data and data["password"]:
        user.hashed_password = get_password_hash(data["password"])

    if "permissions" in data:
        perms = data["permissions"]
        if not isinstance(perms, list):
            return Response({"detail": "Permissions must be a list"}, status=status.HTTP_400_BAD_REQUEST)
        user.set_permissions_list(perms)

    user.save()
    return Response(serialize_user(user))

@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_user(request, user_id):
    checker = RoleChecker(["admin", "subadmin"])
    if not checker.has_permission(request, None):
        return Response({"detail": "You do not have enough permissions to perform this action"}, status=status.HTTP_403_FORBIDDEN)

    user = User.objects.filter(id=user_id).first()
    if not user:
        return Response({"detail": "User not found"}, status=status.HTTP_404_NOT_FOUND)

    if user.id == request.user.id:
        return Response({"detail": "Cannot delete your own account"}, status=status.HTTP_400_BAD_REQUEST)

    # Sub-admin cannot delete admin users
    if request.user.role == "subadmin" and user.role == "admin":
        return Response({"detail": "Sub-admin cannot delete admin users"}, status=status.HTTP_403_FORBIDDEN)

    user.delete()
    return Response({"message": "User deleted successfully"})

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_me_view(request):
    return Response(serialize_user(request.user))
