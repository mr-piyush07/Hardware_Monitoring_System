from django.db import models
from devices_app.models import Device

class Ticket(models.Model):
    subject = models.CharField(max_length=255)
    description = models.TextField()
    priority = models.CharField(max_length=50, default="Medium")
    status = models.CharField(max_length=50, default="Open")
    device = models.ForeignKey(Device, on_delete=models.SET_NULL, null=True, blank=True, db_column='device_id')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tickets"

    def __str__(self):
        return f"Ticket #{self.id}: {self.subject}"
