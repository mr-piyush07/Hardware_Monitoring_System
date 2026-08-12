from django.contrib import admin
from devices_app.models import Device

@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ("id", "hardware_id", "name", "device_type", "user", "last_seen")
    search_fields = ("hardware_id", "name", "secret")
    list_filter = ("device_type",)
