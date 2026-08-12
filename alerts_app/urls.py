from django.urls import path
from alerts_app import views

urlpatterns = [
    # SMTP
    path("smtp", views.smtp_list_create),
    path("smtp/test", views.smtp_test),
    path("smtp/<int:config_id>", views.smtp_delete),
    # Rules
    path("rules", views.alert_rules_list_create),
    path("rules/<int:rule_id>", views.alert_rule_delete),
    # Logs
    path("logs/<int:device_id>", views.get_alert_logs),
    path("logs/<int:log_id>/resolve", views.resolve_alert_log),
    # Templates
    path("templates", views.templates_list_create),
    path("templates/<int:template_id>", views.template_delete),
    # Tickets
    path("tickets", views.tickets_list_create),
    path("tickets/<int:ticket_id>/status", views.ticket_update_status),
]
