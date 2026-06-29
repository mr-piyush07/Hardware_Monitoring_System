from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.modules.auth.service import get_current_user
from app.modules.auth.models import User
from app.modules.alerts import service, schemas, models

from app.modules.auth.service import RoleChecker

router = APIRouter(prefix="/alerts", tags=["alerts"])

@router.post("/smtp", response_model=schemas.SMTPConfigRead)
def create_smtp(config: schemas.SMTPConfigCreate, db: Session = Depends(get_db), admin: User = Depends(RoleChecker(["admin"]))):
    return service.create_smtp_config(db, config, admin.id)

@router.get("/smtp", response_model=List[schemas.SMTPConfigRead])
def list_smtp(db: Session = Depends(get_db), admin: User = Depends(RoleChecker(["admin"]))):
    return service.get_smtp_configs(db, admin.id)

@router.delete("/smtp/{config_id}")
def delete_smtp(config_id: int, db: Session = Depends(get_db), admin: User = Depends(RoleChecker(["admin"]))):
    if not service.delete_smtp_config(db, config_id, admin.id):
        raise HTTPException(status_code=404, detail="SMTP Config not found")
    return {"message": "SMTP Config deleted"}

@router.post("/smtp/test")
def test_smtp(config: schemas.SMTPConfigCreate, test_receiver: str, admin: User = Depends(RoleChecker(["admin"]))):
    success, msg = service.test_smtp_connection(config, test_receiver)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"message": msg}

@router.post("/rules", response_model=schemas.AlertRuleRead)
def create_rule(rule: schemas.AlertRuleCreate, db: Session = Depends(get_db), manager: User = Depends(RoleChecker(["admin", "subadmin"]))):
    from app.modules.devices.service import get_device_by_id
    device = get_device_by_id(db, rule.device_id)
    if not device:
         raise HTTPException(status_code=404, detail="Device not found")
    # SubAdmin can only manage rules for their assigned devices
    if manager.role == "subadmin" and device.user_id != manager.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return service.create_alert_rule(db, rule)

@router.get("/rules", response_model=List[schemas.AlertRuleRead])
def list_rules(db: Session = Depends(get_db), manager: User = Depends(RoleChecker(["admin", "subadmin"]))):
    return service.get_alert_rules(db, manager.id)

@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db), manager: User = Depends(RoleChecker(["admin", "subadmin"]))):
    if not service.delete_alert_rule(db, rule_id, manager.id):
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"message": "Rule decommissioned"}

# Resolve Alert Logic
@router.post("/logs/{log_id}/resolve")
def resolve_alert(log_id: int, db: Session = Depends(get_db), manager: User = Depends(RoleChecker(["admin", "subadmin"]))):
    from datetime import datetime
    log = db.query(models.AlertLog).filter(models.AlertLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    
    log.status = "Resolved"
    log.resolved_at = datetime.utcnow()
    log.resolver_id = manager.id
    db.commit()
    return {"message": "Alert resolved"}

@router.get("/logs/{device_id}", response_model=List[schemas.AlertLogRead])
def get_logs(device_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Check if user has access to device
    from app.modules.devices.service import get_device_by_id
    device = get_device_by_id(db, device_id)
    if not device:
         raise HTTPException(status_code=404, detail="Device not found")
    
    if current_user.role != "admin" and device.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    return service.get_alert_logs(db, device_id)

@router.post("/templates", response_model=schemas.NotificationTemplateRead)
def create_template(template: schemas.NotificationTemplateCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return service.create_notification_template(db, template, current_user.id)

@router.get("/templates", response_model=List[schemas.NotificationTemplateRead])
def list_templates(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return service.get_notification_templates(db, current_user.id)

@router.delete("/templates/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not service.delete_notification_template(db, template_id, current_user.id):
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted"}

# Support Ticket System
@router.post("/tickets", response_model=schemas.SupportTicketRead)
def create_ticket(
    ticket: schemas.SupportTicketCreate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    db_ticket = models.SupportTicket(**ticket.model_dump(), user_id=current_user.id)
    db.add(db_ticket)
    db.commit()
    db.refresh(db_ticket)
    return db_ticket

@router.get("/tickets", response_model=List[schemas.SupportTicketRead])
def list_tickets(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    if current_user.role == "admin":
        return db.query(models.SupportTicket).all()
    return db.query(models.SupportTicket).filter(models.SupportTicket.user_id == current_user.id).all()

@router.patch("/tickets/{ticket_id}/status")
def update_ticket_status(
    ticket_id: int, 
    new_status: str, 
    db: Session = Depends(get_db), 
    manager: User = Depends(RoleChecker(["admin", "subadmin"]))
):
    ticket = db.query(models.SupportTicket).filter(models.SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    ticket.status = new_status
    db.commit()
    return {"message": f"Ticket status updated to {new_status}"}
