from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from datetime import datetime
import logging

from devices_app.models import Device
from telemetry_app.repository import get_telemetry_repository

logger = logging.getLogger(__name__)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_all_user_telemetry(request):
    limit = int(request.query_params.get("limit", 50))
    repo = get_telemetry_repository()
    data = repo.get_all_for_user(user_id=request.user.id, limit=limit)
    return Response(data)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_telemetry(request, hardware_id):
    limit = int(request.query_params.get("limit", 100))
    device = Device.objects.filter(hardware_id=hardware_id).first()
    if not device:
        return Response({"detail": "Device not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.user.role not in ("admin", "subadmin") and device.user_id != request.user.id:
        return Response({"detail": "Not authorized to view this device's telemetry"}, status=status.HTTP_403_FORBIDDEN)

    repo = get_telemetry_repository()
    data = repo.get_by_device(device_id=device.id, limit=limit)
    return Response(data)

@api_view(["POST"])
@permission_classes([AllowAny])
def ingest_telemetry(request):
    """
    Universal Telemetry Ingestion Endpoint:
    - Accepts direct HTTP telemetry from hardware nodes (ESP32, Raspberry Pi, Arduino).
    - Accepts LoRa Gateway proxy telemetry where a LoRa Gateway forwards data for one or more LoRa End Nodes.
    - Authenticates sender using x-hardware-id & x-device-secret (or x-secret-key).
    - Matches payload node_id / hardware_id against registered database devices and stores telemetry under the node's record.
    """
    x_hardware_id = request.headers.get("x-hardware-id")
    x_device_secret = request.headers.get("x-device-secret")
    x_secret_key = request.headers.get("x-secret-key")

    secret = x_device_secret or x_secret_key

    if not x_hardware_id or not secret:
        logger.error(f"Ingest rejected: missing headers. hwid={x_hardware_id}")
        return Response(
            {"detail": "Missing x-hardware-id or secret header (x-device-secret / x-secret-key)"},
            status=status.HTTP_422_UNPROCESSABLE_ENTITY
        )

    # 1. Authenticate sender (Gateway or Direct Node)
    sender_device = Device.objects.filter(hardware_id=x_hardware_id).first()
    if not sender_device:
        logger.error(f"Ingest failed: HWID {x_hardware_id} not found")
        return Response({"detail": "Invalid device credentials"}, status=status.HTTP_401_UNAUTHORIZED)

    if sender_device.secret != secret:
        logger.error(f"Ingest failed: secret mismatch for {x_hardware_id}")
        return Response({"detail": "Invalid device credentials"}, status=status.HTTP_401_UNAUTHORIZED)

    now = datetime.utcnow()
    sender_device.last_seen = now
    sender_device.save(update_fields=["last_seen"])

    body = request.data
    if not isinstance(body, dict) and not isinstance(body, list):
        return Response({"detail": "Body must be a JSON object or array"}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

    repo = get_telemetry_repository()
    processed_nodes = []
    unregistered_nodes = []

    items_to_process = body if isinstance(body, list) else [body]

    for item in items_to_process:
        if not isinstance(item, dict):
            continue

        # Extract sensor data dictionary
        if "data" in item and isinstance(item["data"], dict):
            sensor_data = item["data"].copy()
        else:
            sensor_data = item.copy()

        # Check if a target node_id / hardware_id is explicitly sent in the payload (LoRa Gateway forwarding)
        target_hwid = (
            item.get("node_id") or 
            item.get("hardware_id") or 
            item.get("node") or 
            item.get("device_id") or 
            (sensor_data.get("node_id") if isinstance(sensor_data, dict) else None) or
            (sensor_data.get("hardware_id") if isinstance(sensor_data, dict) else None)
        )

        target_device = None
        if target_hwid:
            target_hwid_str = str(target_hwid).strip()
            if target_hwid_str == x_hardware_id:
                target_device = sender_device
            else:
                # Find the target LoRa / Hardware Node registered in DB
                target_device = Device.objects.filter(hardware_id=target_hwid_str).first()
                if not target_device:
                    logger.warning(f"Gateway '{x_hardware_id}' sent payload for unregistered Node HWID '{target_hwid_str}'")
                    unregistered_nodes.append(target_hwid_str)

        # Fallback to sender device if no specific target node is found
        if not target_device:
            target_device = sender_device

        # Update target node's last_seen timestamp
        target_device.last_seen = now
        target_device.save(update_fields=["last_seen"])

        # Save telemetry under target node's ID
        repo.create(device_id=target_device.id, data=sensor_data)
        processed_nodes.append(target_device.hardware_id)

        # Evaluate alert rules for target node
        try:
            from alerts_app.services import check_alerts
            check_alerts(target_device.id, sensor_data)
        except Exception as e:
            logger.error(f"Alert check error during ingest for {target_device.hardware_id}: {e}")

    resp = {
        "status": "ok",
        "gateway": x_hardware_id,
        "processed_nodes": list(set(processed_nodes)),
    }
    if unregistered_nodes:
        resp["warning"] = f"Unregistered node IDs: {list(set(unregistered_nodes))}. Please register them in dashboard."

    return Response(resp)
