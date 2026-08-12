from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from tickets_app.models import Ticket

def serialize_ticket(ticket):
    return {
        "id": ticket.id,
        "subject": ticket.subject,
        "description": ticket.description,
        "priority": ticket.priority,
        "status": ticket.status,
        "device_id": ticket.device_id,
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
        "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else None,
    }

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def ticket_list_create(request):
    if request.method == "POST":
        data = request.data
        ticket = Ticket.objects.create(
            subject=data.get("subject"),
            description=data.get("description"),
            priority=data.get("priority", "Medium"),
            status=data.get("status", "Open"),
            device_id=data.get("device_id")
        )
        return Response(serialize_ticket(ticket), status=status.HTTP_201_CREATED)
    else:
        tickets = Ticket.objects.all()
        return Response([serialize_ticket(t) for t in tickets])

@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def ticket_detail_update(request, ticket_id):
    ticket = Ticket.objects.filter(id=ticket_id).first()
    if not ticket:
        return Response({"detail": "Ticket not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(serialize_ticket(ticket))

    elif request.method == "PATCH":
        data = request.data
        if "subject" in data: ticket.subject = data["subject"]
        if "description" in data: ticket.description = data["description"]
        if "priority" in data: ticket.priority = data["priority"]
        if "status" in data: ticket.status = data["status"]
        if "device_id" in data: ticket.device_id = data["device_id"]
        ticket.save()
        return Response(serialize_ticket(ticket))
