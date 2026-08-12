import secrets
import string
from django.db import models
from auth_app.models import User

def generate_device_secret():
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(32))

class Device(models.Model):
    hardware_id = models.CharField(max_length=255, unique=True, db_index=True)
    name = models.CharField(max_length=255)
    secret = models.CharField(max_length=255, unique=True, db_index=True, default=generate_device_secret)
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='user_id', null=True, blank=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    device_type = models.CharField(max_length=100, default="ESP")

    class Meta:
        db_table = "devices"

    def __str__(self):
        return f"{self.name} ({self.hardware_id})"
