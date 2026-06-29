from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.core.database import get_db
from app.modules.auth.service import get_current_user
from app.modules.auth.models import User
from app.modules.telemetry import service, schemas
from app.modules.devices import service as device_service
import logging

router = APIRouter(prefix="/telemetry", tags=["telemetry"])

@router.get("/user/all", response_model=List[schemas.TelemetryRead])
def get_all_user_telemetry(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return service.get_all_user_telemetry(db, user_id=current_user.id, limit=limit)

@router.get("/{hardware_id}", response_model=List[schemas.TelemetryRead])
def get_telemetry(
    hardware_id: str,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.modules.devices.service import get_device_by_hwid
    device = get_device_by_hwid(db, hardware_id=hardware_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    if current_user.role not in ("admin", "subadmin") and device.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this device's telemetry")
    
    return service.get_device_telemetry(db, device_id=device.id, limit=limit)

@router.post("/ingest")
async def ingest_telemetry(
    request: Request,
    db: Session = Depends(get_db),
    x_hardware_id: Optional[str] = Header(None),
    x_device_secret: Optional[str] = Header(None),  # new standard header
    x_secret_key: Optional[str] = Header(None),      # old Arduino firmware header
):
    """
    Flexible ingest — accepts both payload formats:
      - Wrapped:  {"data": {"temp": 25, "hum": 60}}
      - Flat:     {"temp": 25, "hum": 60}
    Accepts both header names:
      - x-device-secret  (new standard)
      - x-secret-key     (old Arduino firmware sends this)
    """
    secret = x_device_secret or x_secret_key

    if not x_hardware_id or not secret:
        logging.error(f"Ingest rejected: missing headers. hwid={x_hardware_id} secret={'set' if secret else 'MISSING'}")
        raise HTTPException(status_code=422, detail="Missing x-hardware-id or secret header (x-device-secret / x-secret-key)")

    device = device_service.get_device_by_hwid(db, hardware_id=x_hardware_id)
    if not device:
        logging.error(f"Ingest failed: HWID {x_hardware_id} not found")
        raise HTTPException(status_code=401, detail="Invalid device credentials")

    if device.secret != secret:
        logging.error(f"Ingest failed: secret mismatch for {x_hardware_id}. Got: {secret[:6]}...")
        raise HTTPException(status_code=401, detail="Invalid device credentials")

    # Parse body — accept both flat and wrapped formats
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid JSON body")

    if isinstance(body, dict) and "data" in body and isinstance(body["data"], dict):
        sensor_data = body["data"]   # wrapped: {"data": {...}}
    elif isinstance(body, dict) and body:
        sensor_data = body           # flat: {"temp": 25, ...}
    else:
        raise HTTPException(status_code=422, detail="Body must be a non-empty JSON object")

    logging.info(f"Ingest OK: {x_hardware_id} → keys={list(sensor_data.keys())}")
    device.last_seen = datetime.utcnow()
    db.commit()

    telemetry = service.create_telemetry(db, device_id=device.id, data=sensor_data)

    from app.modules.alerts.service import check_alerts
    check_alerts(db, device.id, sensor_data)

    return {"status": "ok", "device": x_hardware_id, "keys": list(sensor_data.keys())}

    """
    Flexible ingest: accepts both:
      - Wrapped:  {"data": {"temp": 25, "hum": 60}}
      - Flat:     {"temp": 25, "hum": 60}
    Headers: x-hardware-id and x-device-secret
    """
    # Validate headers present
    if not x_hardware_id or not x_device_secret:
        raise HTTPException(status_code=422, detail="Missing x-hardware-id or x-device-secret headers")

    device = device_service.get_device_by_hwid(db, hardware_id=x_hardware_id)
    if not device:
        logging.error(f"Ingest failed: HWID {x_hardware_id} not found")
        raise HTTPException(status_code=401, detail="Invalid device credentials")
    
    if device.secret != x_device_secret:
        logging.error(f"Ingest failed: secret mismatch for {x_hardware_id}")
        raise HTTPException(status_code=401, detail="Invalid device credentials")

    # Parse body — accept both flat and wrapped formats
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid JSON body")

    if isinstance(body, dict) and "data" in body and isinstance(body["data"], dict):
        sensor_data = body["data"]   # wrapped format: {"data": {...}}
    elif isinstance(body, dict):
        sensor_data = body           # flat format: {"temp": 25, ...}
    else:
        raise HTTPException(status_code=422, detail="Body must be a JSON object")

    logging.info(f"Ingest OK: {x_hardware_id} → {sensor_data}")
    device.last_seen = datetime.utcnow()
    db.commit()

    telemetry = service.create_telemetry(db, device_id=device.id, data=sensor_data)

    from app.modules.alerts.service import check_alerts
    check_alerts(db, device.id, sensor_data)

    return {"status": "ok", "device": x_hardware_id, "data": sensor_data}

