from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from datetime import datetime

from alerts_app import models, services
from devices_app.models import Device
from core.authentication import RoleChecker

# --- Serializers Helpers ---
def serialize_smtp(config):
    return {
        "id": config.id,
        "user_id": config.user_id,
        "name": config.name,
        "from_email": config.from_email,
        "from_name": config.from_name,
        "host": config.host,
        "port": config.port,
        "username": config.username,
        "password": config.password,
        "security": config.security,
        "helo_ident": config.helo_ident,
        "auth_type": config.auth_type,
        "tls_method": config.tls_method,
        "is_active": config.is_active,
    }

def serialize_rule(rule):
    return {
        "id": rule.id,
        "device_id": rule.device_id,
        "smtp_config_id": rule.smtp_config_id,
        "name": rule.name,
        "sensor_key": rule.sensor_key,
        "trigger_type": rule.trigger_type,
        "condition_value": rule.condition_value,
        "operator": rule.operator,
        "recipients": rule.recipients,
        "subject": rule.subject,
        "template": rule.template,
        "is_active": rule.is_active,
        "last_triggered": rule.last_triggered.isoformat() if rule.last_triggered else None,
        "cooldown_seconds": rule.cooldown_seconds,
    }

def serialize_template(template):
    return {
        "id": template.id,
        "user_id": template.user_id,
        "name": template.name,
        "subject": template.subject,
        "body": template.body,
        "is_active": template.is_active,
    }

def serialize_log(log):
    return {
        "id": log.id,
        "device_id": log.device_id,
        "rule_id": log.rule_id,
        "message": log.message,
        "status": log.status,
        "resolved_at": log.resolved_at.isoformat() if log.resolved_at else None,
        "resolver_id": log.resolver_id,
        "timestamp": log.timestamp.isoformat() if log.timestamp else None,
    }

def serialize_ticket(ticket):
    return {
        "id": ticket.id,
        "user_id": ticket.user_id,
        "device_id": ticket.device_id,
        "subject": ticket.subject,
        "description": ticket.description,
        "status": ticket.status,
        "priority": ticket.priority,
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
        "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else None,
    }

# --- SMTP Views ---
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def smtp_list_create(request):
    checker = RoleChecker(["admin"])
    if not checker.has_permission(request, None):
        return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "POST":
        config = models.SMTPConfig.objects.create(user=request.user, **request.data)
        return Response(serialize_smtp(config), status=status.HTTP_201_CREATED)
    else:
        configs = models.SMTPConfig.objects.filter(user=request.user)
        return Response([serialize_smtp(c) for c in configs])

@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def smtp_delete(request, config_id):
    checker = RoleChecker(["admin"])
    if not checker.has_permission(request, None):
        return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

    config = models.SMTPConfig.objects.filter(id=config_id, user=request.user).first()
    if not config:
        return Response({"detail": "SMTP Config not found"}, status=status.HTTP_404_NOT_FOUND)
    config.delete()
    return Response({"message": "SMTP Config deleted"})

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def smtp_test(request):
    checker = RoleChecker(["admin"])
    if not checker.has_permission(request, None):
        return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

    test_receiver = request.query_params.get("test_receiver")
    if not test_receiver:
        return Response({"detail": "Missing test_receiver query parameter"}, status=status.HTTP_400_BAD_REQUEST)

    success, msg = services.test_smtp_connection(request.data, test_receiver)
    if not success:
        return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"message": msg})

# --- Alert Rules Views ---
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def alert_rules_list_create(request):
    checker = RoleChecker(["admin", "subadmin"])
    if not checker.has_permission(request, None):
        return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "POST":
        device_id = request.data.get("device_id")
        device = Device.objects.filter(id=device_id).first()
        if not device:
            return Response({"detail": "Device not found"}, status=status.HTTP_404_NOT_FOUND)

        if request.user.role == "subadmin" and device.user_id != request.user.id:
            return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

        rule = models.AlertRule.objects.create(**request.data)
        return Response(serialize_rule(rule), status=status.HTTP_201_CREATED)
    else:
        rules = models.AlertRule.objects.filter(device__user_id=request.user.id)
        return Response([serialize_rule(r) for r in rules])

@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def alert_rule_delete(request, rule_id):
    checker = RoleChecker(["admin", "subadmin"])
    if not checker.has_permission(request, None):
        return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

    rule = models.AlertRule.objects.filter(id=rule_id, device__user_id=request.user.id).first()
    if not rule:
        return Response({"detail": "Rule not found"}, status=status.HTTP_404_NOT_FOUND)
    rule.delete()
    return Response({"message": "Rule decommissioned"})

# --- Logs Views ---
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_alert_logs(request, device_id):
    device = Device.objects.filter(id=device_id).first()
    if not device:
        return Response({"detail": "Device not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.user.role != "admin" and device.user_id != request.user.id:
        return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

    logs = models.AlertLog.objects.filter(device_id=device_id).order_by("-timestamp")[:50]
    return Response([serialize_log(l) for l in logs])

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def resolve_alert_log(request, log_id):
    checker = RoleChecker(["admin", "subadmin"])
    if not checker.has_permission(request, None):
        return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

    log = models.AlertLog.objects.filter(id=log_id).first()
    if not log:
        return Response({"detail": "Log not found"}, status=status.HTTP_404_NOT_FOUND)

    log.status = "Resolved"
    log.resolved_at = datetime.utcnow()
    log.resolver = request.user
    log.save()
    return Response({"message": "Alert resolved"})

# --- Templates Views ---
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def templates_list_create(request):
    if request.method == "POST":
        template = models.NotificationTemplate.objects.create(user=request.user, **request.data)
        return Response(serialize_template(template), status=status.HTTP_201_CREATED)
    else:
        templates = models.NotificationTemplate.objects.filter(user=request.user)
        return Response([serialize_template(t) for t in templates])

@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def template_delete(request, template_id):
    template = models.NotificationTemplate.objects.filter(id=template_id, user=request.user).first()
    if not template:
        return Response({"detail": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
    template.delete()
    return Response({"message": "Template deleted"})

# --- Support Tickets Views (inside /alerts/tickets) ---
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def tickets_list_create(request):
    if request.method == "POST":
        ticket = models.SupportTicket.objects.create(user=request.user, **request.data)
        return Response(serialize_ticket(ticket), status=status.HTTP_201_CREATED)
    else:
        if request.user.role == "admin":
            tickets = models.SupportTicket.objects.all()
        else:
            tickets = models.SupportTicket.objects.filter(user=request.user)
        return Response([serialize_ticket(t) for t in tickets])

@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def ticket_update_status(request, ticket_id):
    checker = RoleChecker(["admin", "subadmin"])
    if not checker.has_permission(request, None):
        return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

    ticket = models.SupportTicket.objects.filter(id=ticket_id).first()
    if not ticket:
        return Response({"detail": "Ticket not found"}, status=status.HTTP_404_NOT_FOUND)

    new_status = request.data.get("new_status") or request.query_params.get("new_status")
    if not new_status:
        return Response({"detail": "Missing new_status"}, status=status.HTTP_400_BAD_REQUEST)

    ticket.status = new_status
    ticket.save()
    return Response({"message": f"Ticket status updated to {new_status}"})
