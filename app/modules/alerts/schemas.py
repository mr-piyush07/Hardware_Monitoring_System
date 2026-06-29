from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

class SMTPConfigBase(BaseModel):
    name: str
    from_email: str
    from_name: str
    host: str
    port: int
    username: Optional[str] = None
    password: Optional[str] = None
    security: str
    helo_ident: str = "IoT-Guard-Node"
    auth_type: str = "Standard"
    tls_method: str = "Auto-Negotiate"
    is_active: bool = True

class SMTPConfigCreate(SMTPConfigBase):
    pass

class SMTPConfigRead(SMTPConfigBase):
    id: int
    user_id: int
    class Config:
        from_attributes = True

class AlertRuleBase(BaseModel):
    name: str
    device_id: int
    smtp_config_id: int
    sensor_key: Optional[str] = None
    trigger_type: str
    condition_value: Optional[float] = None
    operator: Optional[str] = None
    recipients: str
    subject: str
    template: str
    is_active: bool = True
    cooldown_seconds: int = 300

class AlertRuleCreate(AlertRuleBase):
    pass

class AlertRuleRead(AlertRuleBase):
    id: int
    class Config:
        from_attributes = True

class NotificationTemplateBase(BaseModel):
    name: str
    subject: str
    body: str

class NotificationTemplateCreate(NotificationTemplateBase):
    pass

class NotificationTemplateRead(NotificationTemplateBase):
    id: int
    user_id: int
    class Config:
        from_attributes = True

class AlertLogRead(BaseModel):
    id: int
    device_id: int
    rule_id: int
    message: str
    status: str
    resolved_at: Optional[datetime] = None
    resolver_id: Optional[int] = None
    timestamp: datetime
    class Config:
        from_attributes = True

class SupportTicketBase(BaseModel):
    device_id: Optional[int] = None
    subject: str
    description: str
    priority: str = "Medium"

class SupportTicketCreate(SupportTicketBase):
    pass

class SupportTicketRead(SupportTicketBase):
    id: int
    user_id: int
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True
