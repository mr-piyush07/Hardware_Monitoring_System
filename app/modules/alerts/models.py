from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class SMTPConfig(Base):
    __tablename__ = "smtp_configs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String, nullable=False)
    from_email = Column(String, nullable=False)
    from_name = Column(String, nullable=False)
    host = Column(String, nullable=False)
    port = Column(Integer, nullable=False)
    username = Column(String, nullable=True)
    password = Column(String, nullable=True)
    security = Column(String, default="TLS") # TLS, SSL, None
    
    # Advanced PRTG-style fields
    helo_ident = Column(String, default="IoT-Guard-Node")
    auth_type = Column(String, default="Standard") # None, Standard, SASL
    tls_method = Column(String, default="Auto-Negotiate") # Auto, SSLv3, TLS1.2, etc.
    
    is_active = Column(Boolean, default=True)

class AlertRule(Base):
    __tablename__ = "alert_rules"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    smtp_config_id = Column(Integer, ForeignKey("smtp_configs.id"))
    
    name = Column(String, nullable=False)
    sensor_key = Column(String, nullable=True) # Optional for heartbeat
    trigger_type = Column(String, nullable=False) # state, heartbeat, speed
    
    # Condition parameters
    condition_value = Column(Float, nullable=True) # Threshold or Timeout minutes
    operator = Column(String, nullable=True) # >, <, ==, !=
    
    # Notification details
    recipients = Column(String, nullable=False) 
    subject = Column(String, nullable=False)
    template = Column(String, nullable=False)
    
    is_active = Column(Boolean, default=True)
    last_triggered = Column(DateTime, nullable=True) 
    cooldown_seconds = Column(Integer, default=300) 

class NotificationTemplate(Base):
    __tablename__ = "notification_templates"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String, nullable=False)
    subject = Column(String, nullable=False) # e.g. "Alert: {device_name} - {sensor}"
    body = Column(String, nullable=False) # e.g. "Sensor {sensor} reached {value}"
    
    is_active = Column(Boolean, default=True)

class AlertLog(Base):
    __tablename__ = "alert_logs"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    rule_id = Column(Integer, ForeignKey("alert_rules.id"))
    message = Column(String, nullable=False)
    status = Column(String, default="Open") # Open, Resolved, Acknowledged
    resolved_at = Column(DateTime, nullable=True)
    resolver_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=True)
    subject = Column(String, nullable=False)
    description = Column(String, nullable=False)
    status = Column(String, default="Open") # Open, In-Progress, Closed
    priority = Column(String, default="Medium") # Low, Medium, High
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
