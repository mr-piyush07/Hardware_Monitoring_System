from sqlalchemy.orm import Session
from app.modules.telemetry import models, schemas
from typing import List

def create_telemetry(db: Session, device_id: int, data: dict):
    db_telemetry = models.Telemetry(device_id=device_id, data=data)
    db.add(db_telemetry)
    db.commit()
    db.refresh(db_telemetry)
    return db_telemetry

def get_device_telemetry(db: Session, device_id: int, limit: int = 100) -> List[models.Telemetry]:
    return db.query(models.Telemetry).filter(models.Telemetry.device_id == device_id).order_by(models.Telemetry.timestamp.desc()).limit(limit).all()

def get_all_user_telemetry(db: Session, user_id: int, limit: int = 50):
    from app.modules.devices.models import Device
    return db.query(models.Telemetry).join(Device).filter(Device.user_id == user_id).order_by(models.Telemetry.timestamp.desc()).limit(limit).all()
