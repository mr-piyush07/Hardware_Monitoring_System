from django.db import models
from auth_app.models import User
from devices_app.models import Device

class SMTPConfig(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='user_id')
    name = models.CharField(max_length=255)
    from_email = models.CharField(max_length=255)
    from_name = models.CharField(max_length=255)
    host = models.CharField(max_length=255)
    port = models.IntegerField()
    username = models.CharField(max_length=255, null=True, blank=True)
    password = models.CharField(max_length=255, null=True, blank=True)
    security = models.CharField(max_length=50, default="TLS") # TLS, SSL, None
    helo_ident = models.CharField(max_length=255, default="IoT-Guard-Node")
    auth_type = models.CharField(max_length=50, default="Standard") # None, Standard, SASL
    tls_method = models.CharField(max_length=50, default="Auto-Negotiate")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "smtp_configs"

class AlertRule(models.Model):
    device = models.ForeignKey(Device, on_delete=models.CASCADE, db_column='device_id')
    smtp_config = models.ForeignKey(SMTPConfig, on_delete=models.CASCADE, db_column='smtp_config_id')
    name = models.CharField(max_length=255)
    sensor_key = models.CharField(max_length=255, null=True, blank=True)
    trigger_type = models.CharField(max_length=50) # state, heartbeat, speed
    condition_value = models.FloatField(null=True, blank=True)
    operator = models.CharField(max_length=10, null=True, blank=True) # >, <, ==, !=
    recipients = models.TextField()
    subject = models.CharField(max_length=255)
    template = models.TextField()
    is_active = models.BooleanField(default=True)
    last_triggered = models.DateTimeField(null=True, blank=True)
    cooldown_seconds = models.IntegerField(default=300)

    class Meta:
        db_table = "alert_rules"

class NotificationTemplate(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='user_id')
    name = models.CharField(max_length=255)
    subject = models.CharField(max_length=255)
    body = models.TextField()
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "notification_templates"

class AlertLog(models.Model):
    device = models.ForeignKey(Device, on_delete=models.CASCADE, db_column='device_id')
    rule = models.ForeignKey(AlertRule, on_delete=models.CASCADE, db_column='rule_id')
    message = models.TextField()
    status = models.CharField(max_length=50, default="Open") # Open, Resolved, Acknowledged
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolver = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, db_column='resolver_id')
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "alert_logs"
        ordering = ["-timestamp"]

class SupportTicket(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='user_id')
    device = models.ForeignKey(Device, on_delete=models.SET_NULL, null=True, blank=True, db_column='device_id')
    subject = models.CharField(max_length=255)
    description = models.TextField()
    status = models.CharField(max_length=50, default="Open") # Open, In-Progress, Closed
    priority = models.CharField(max_length=50, default="Medium") # Low, Medium, High
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "support_tickets"
