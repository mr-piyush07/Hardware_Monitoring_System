from pydantic import BaseModel
from datetime import datetime
from typing import Any, Dict

class TelemetryBase(BaseModel):
    data: Dict[str, Any]

class TelemetryRead(TelemetryBase):
    id: int
    device_id: int
    timestamp: datetime

    class Config:
        from_attributes = True