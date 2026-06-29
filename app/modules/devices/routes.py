from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.modules.auth.service import get_current_user, RoleChecker
from app.modules.auth.models import User
from app.modules.devices import service, schemas

router = APIRouter(prefix="/devices", tags=["devices"])

@router.post("/", response_model=schemas.DeviceRead)
def register_device(
    device_in: schemas.DeviceCreate, 
    db: Session = Depends(get_db),
    admin: User = Depends(RoleChecker(["admin", "subadmin"]))
):
    db_device = service.get_device_by_hwid(db, hardware_id=device_in.hardware_id)
    if db_device:
        raise HTTPException(status_code=400, detail="Device already registered")
    # For now, admin is the owner, but we can add 'assigned_user_id' later
    return service.create_device(db=db, device=device_in, user_id=admin.id)

@router.get("/", response_model=List[schemas.DeviceRead])
def list_devices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role == "admin":
        return db.query(service.models.Device).all()
    return service.get_user_devices(db, user_id=current_user.id)

@router.delete("/{device_id}")
def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(RoleChecker(["admin"]))
):
    device = service.get_device_by_id(db, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    service.delete_device(db, device_id)
    return {"message": "Device deleted"}
