import secrets
import string
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.core.database import Base

def generate_device_secret():
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(32))

class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    hardware_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    secret = Column(String, unique=True, index=True, nullable=False, default=generate_device_secret)
    user_id = Column(Integer, ForeignKey("users.id"))
    last_seen = Column(DateTime, nullable=True)

    owner = relationship("User")
