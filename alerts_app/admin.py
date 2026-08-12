from django.contrib import admin
from alerts_app.models import SMTPConfig, AlertRule, NotificationTemplate, AlertLog, SupportTicket

@admin.register(SMTPConfig)
class SMTPConfigAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "from_email", "host", "port", "security", "is_active")

@admin.register(AlertRule)
class AlertRuleAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "device", "trigger_type", "sensor_key", "is_active", "last_triggered")

@admin.register(NotificationTemplate)
class NotificationTemplateAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "subject", "user", "is_active")

@admin.register(AlertLog)
class AlertLogAdmin(admin.ModelAdmin):
    list_display = ("id", "device", "rule", "status", "timestamp", "resolved_at")

@admin.register(SupportTicket)
class SupportTicketAdmin(admin.ModelAdmin):
    list_display = ("id", "subject", "user", "device", "priority", "status", "created_at")
