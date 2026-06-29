from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class DeviceBase(BaseModel):
    hardware_id: str
    name: str

class DeviceCreate(DeviceBase):
    pass

class DeviceRead(DeviceBase):
    id: int
    secret: str
    last_seen: Optional[datetime] = None

    class Config:
        from_attributes = True
