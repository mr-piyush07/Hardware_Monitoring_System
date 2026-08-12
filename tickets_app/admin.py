from django.contrib import admin
from tickets_app.models import Ticket

@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = ("id", "subject", "priority", "status", "device", "created_at")
    list_filter = ("status", "priority")
