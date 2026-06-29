import smtplib
from email.mime.text import MIMEText
from sqlalchemy.orm import Session
from app.modules.alerts import models, schemas
import time

def create_smtp_config(db: Session, config: schemas.SMTPConfigCreate, user_id: int):
    db_config = models.SMTPConfig(**config.dict(), user_id=user_id)
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return db_config

def get_smtp_configs(db: Session, user_id: int):
    return db.query(models.SMTPConfig).filter(models.SMTPConfig.user_id == user_id).all()

def delete_smtp_config(db: Session, config_id: int, user_id: int):
    config = db.query(models.SMTPConfig).filter(models.SMTPConfig.id == config_id, models.SMTPConfig.user_id == user_id).first()
    if config:
        db.delete(config)
        db.commit()
        return True
    return False

def create_notification_template(db: Session, template: schemas.NotificationTemplateCreate, user_id: int):
    db_template = models.NotificationTemplate(**template.dict(), user_id=user_id)
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    return db_template

def get_notification_templates(db: Session, user_id: int):
    return db.query(models.NotificationTemplate).filter(models.NotificationTemplate.user_id == user_id).all()

def delete_notification_template(db: Session, template_id: int, user_id: int):
    template = db.query(models.NotificationTemplate).filter(models.NotificationTemplate.id == template_id, models.NotificationTemplate.user_id == user_id).first()
    if template:
        db.delete(template)
        db.commit()
        return True
    return False

def test_smtp_connection(config: schemas.SMTPConfigCreate, test_receiver: str):
    try:
        # 1. Initialize Server with HELO
        if config.security == "SSL":
            server = smtplib.SMTP_SSL(config.host, config.port, local_hostname=config.helo_ident)
        else:
            server = smtplib.SMTP(config.host, config.port, local_hostname=config.helo_ident)
            if config.security == "TLS":
                server.starttls()
        
        # 2. Authentication Logic
        if config.auth_type == "Standard":
            server.login(config.username, config.password)
        elif config.auth_type == "SASL":
            # Basic SASL implementation
            server.login(config.username, config.password)
            
        # 3. Send Test Mail
        msg = MIMEText(f"Hi from IoT Guard!\n\nThis is a system connection test for your SMTP Relay: {config.name}.\nHELO ID: {config.helo_ident}")
        msg['Subject'] = "IoT Guard: System Connection Test"
        msg['From'] = f"{config.from_name} <{config.from_email}>"
        msg['To'] = test_receiver
        
        server.sendmail(config.from_email, [test_receiver], msg.as_string())
        server.quit()
        return True, "Test Email Sent Successfully!"
    except Exception as e:
        return False, str(e)

def send_alert_email(smtp: models.SMTPConfig, recipients: str, subject: str, body: str):
    try:
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = f"{smtp.from_name} <{smtp.from_email}>"
        msg['To'] = recipients

        if smtp.security == "SSL":
            server = smtplib.SMTP_SSL(smtp.host, smtp.port, local_hostname=smtp.helo_ident)
        else:
            server = smtplib.SMTP(smtp.host, smtp.port, local_hostname=smtp.helo_ident)
            if smtp.security == "TLS":
                server.starttls()
        
        if smtp.auth_type != "None":
            server.login(smtp.username, smtp.password)
            
        server.sendmail(smtp.from_email, recipients.split(','), msg.as_string())
        server.quit()
        return True
    except Exception as e:
        print(f"SMTP Error: {e}")
        return False

from datetime import datetime, timedelta

def check_alerts(db: Session, device_id: int, telemetry_data: dict):
    rules = db.query(models.AlertRule).filter(models.AlertRule.device_id == device_id, models.AlertRule.is_active == True).all()
    
    for rule in rules:
        if rule.sensor_key in telemetry_data:
            val = telemetry_data[rule.sensor_key]
            triggered = False
            
            if rule.operator == ">" and val > rule.condition_value: triggered = True
            elif rule.operator == "<" and val < rule.condition_value: triggered = True
            elif rule.operator == "==" and val == rule.condition_value: triggered = True
            
            if triggered:
                # Check Cooldown
                now = datetime.utcnow()
                if rule.last_triggered:
                    elapsed = (now - rule.last_triggered).total_seconds()
                    if elapsed < rule.cooldown_seconds:
                        continue # Still in cooldown
                
                # Update last_triggered
                rule.last_triggered = now
                
                # Log the alert
                from app.modules.devices.models import Device
                device = db.query(Device).filter(Device.id == device_id).first()
                device_name = device.name if device else "Unknown Device"
                
                # Replace placeholders
                msg_body = rule.template.replace("{value}", str(val))
                msg_body = msg_body.replace("{sensor}", rule.sensor_key)
                msg_body = msg_body.replace("{device}", device_name)
                
                msg_subject = rule.subject.replace("{device}", device_name)
                msg_subject = msg_subject.replace("{sensor}", rule.sensor_key)

                alert_log = models.AlertLog(device_id=device_id, rule_id=rule.id, message=msg_body)
                db.add(alert_log)
                db.commit()
                
                # Send Email
                smtp = db.query(models.SMTPConfig).filter(models.SMTPConfig.id == rule.smtp_config_id).first()
                if smtp:
                    send_alert_email(smtp, rule.recipients, msg_subject, msg_body)

def get_alert_logs(db: Session, device_id: int, limit: int = 50):
    return db.query(models.AlertLog).filter(models.AlertLog.device_id == device_id).order_by(models.AlertLog.timestamp.desc()).limit(limit).all()

def create_alert_rule(db: Session, rule: schemas.AlertRuleCreate):
    db_rule = models.AlertRule(**rule.dict())
    db.add(db_rule)
    db.commit()
    db.refresh(db_rule)
    return db_rule

def get_alert_rules(db: Session, user_id: int):
    # Need to join with devices to filter by user_id
    from app.modules.devices.models import Device
    return db.query(models.AlertRule).join(Device).filter(Device.user_id == user_id).all()

def process_heartbeat_alerts(db: Session):
    # Get all active heartbeat rules
    from app.modules.devices.models import Device
    rules = db.query(models.AlertRule).filter(models.AlertRule.trigger_type == 'heartbeat', models.AlertRule.is_active == True).all()
    
    for rule in rules:
        device = db.query(Device).filter(Device.id == rule.device_id).first()
        if not device or not device.last_seen:
            continue
            
        now = datetime.utcnow()
        # condition_value stores timeout in minutes
        timeout_threshold = rule.condition_value or 5
        last_seen_delta = (now - device.last_seen).total_seconds() / 60
        
        if last_seen_delta > timeout_threshold:
            # Check Cooldown
            if rule.last_triggered:
                elapsed_cooldown = (now - rule.last_triggered).total_seconds()
                if elapsed_cooldown < rule.cooldown_seconds:
                    continue
            
            # Trigger!
            rule.last_triggered = now
            db.commit()
            
            msg_body = rule.template.replace("{device}", device.name)
            msg_body = msg_body.replace("{value}", f"{int(last_seen_delta)} min")
            msg_body = msg_body.replace("{sensor}", "Heartbeat")
            
            msg_subject = rule.subject.replace("{device}", device.name)
            
            alert_log = models.AlertLog(device_id=device.id, rule_id=rule.id, message=msg_body)
            db.add(alert_log)
            db.commit()
            
            smtp = db.query(models.SMTPConfig).filter(models.SMTPConfig.id == rule.smtp_config_id).first()
            if smtp:
                send_alert_email(smtp, rule.recipients, msg_subject, msg_body)

def delete_alert_rule(db: Session, rule_id: int, user_id: int):
    from app.modules.devices.models import Device
    rule = db.query(models.AlertRule).join(Device).filter(models.AlertRule.id == rule_id, Device.user_id == user_id).first()
    if rule:
        db.delete(rule)
        db.commit()
        return True
    return False
