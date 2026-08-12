from django.contrib import admin
from telemetry_app.models import Telemetry

@admin.register(Telemetry)
class TelemetryAdmin(admin.ModelAdmin):
    list_display = ("id", "device", "timestamp")
    list_filter = ("timestamp", "device")
