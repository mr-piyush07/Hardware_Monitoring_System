from django.db import models
from devices_app.models import Device

class Telemetry(models.Model):
    device = models.ForeignKey(Device, on_delete=models.CASCADE, db_column='device_id')
    data = models.JSONField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "telemetry"
        ordering = ["-timestamp"]

    def __str__(self):
        return f"Telemetry {self.id} for Device {self.device_id}"
