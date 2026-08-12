from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from devices_app.models import Device
from core.authentication import RoleChecker

def serialize_device(device):
    return {
        "id": device.id,
        "hardware_id": device.hardware_id,
        "name": device.name,
        "secret": device.secret,
        "device_type": device.device_type,
        "user_id": device.user_id if device.user else None,
        "last_seen": device.last_seen.isoformat() if device.last_seen else None,
    }

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def device_list_create(request):
    if request.method == "POST":
        checker = RoleChecker(["admin", "subadmin"])
        if not checker.has_permission(request, None):
            return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

        data = request.data
        hwid = data.get("hardware_id")
        name = data.get("name")
        device_type = data.get("device_type", "ESP")

        if not hwid or not name:
            return Response({"detail": "hardware_id and name are required"}, status=status.HTTP_400_BAD_REQUEST)

        if Device.objects.filter(hardware_id=hwid).exists():
            return Response({"detail": "Device already registered"}, status=status.HTTP_400_BAD_REQUEST)

        device = Device.objects.create(
            hardware_id=hwid,
            name=name,
            device_type=device_type,
            user=request.user
        )
        return Response(serialize_device(device), status=status.HTTP_201_CREATED)

    elif request.method == "GET":
        if request.user.role == "admin":
            devices = Device.objects.all()
        else:
            devices = Device.objects.filter(user=request.user)
        return Response([serialize_device(d) for d in devices])

@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def device_delete(request, device_id):
    checker = RoleChecker(["admin"])
    if not checker.has_permission(request, None):
        return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

    device = Device.objects.filter(id=device_id).first()
    if not device:
        return Response({"detail": "Device not found"}, status=status.HTTP_404_NOT_FOUND)

    device.delete()
    return Response({"message": "Device deleted"})
