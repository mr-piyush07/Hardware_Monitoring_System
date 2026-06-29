from sqlalchemy.orm import Session
from app.modules.devices import models, schemas
from app.modules.auth.models import User

def get_device_by_hwid(db: Session, hardware_id: str):
    return db.query(models.Device).filter(models.Device.hardware_id == hardware_id).first()

def get_device_by_secret(db: Session, secret: str):
    return db.query(models.Device).filter(models.Device.secret == secret).first()

def get_user_devices(db: Session, user_id: int):
    return db.query(models.Device).filter(models.Device.user_id == user_id).all()

def create_device(db: Session, device: schemas.DeviceCreate, user_id: int):
    db_device = models.Device(
        hardware_id=device.hardware_id,
        name=device.name,
        user_id=user_id
    )
    db.add(db_device)
    db.commit()
    db.refresh(db_device)
    return db_device

def get_device_by_id(db: Session, device_id: int):
    return db.query(models.Device).filter(models.Device.id == device_id).first()

def delete_device(db: Session, device_id: int):
    db_device = get_device_by_id(db, device_id)
    if db_device:
        db.delete(db_device)
        db.commit()
        return True
    return False
