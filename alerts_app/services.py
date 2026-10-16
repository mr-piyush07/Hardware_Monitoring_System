import smtplib
from email.mime.text import MIMEText
from datetime import datetime, timedelta
from django.utils import timezone
from alerts_app import models
from devices_app.models import Device
import logging

logger = logging.getLogger(__name__)

def test_smtp_connection(config_data: dict, test_receiver: str):
    try:
        security = config_data.get("security", "TLS")
        host = config_data.get("host")
        port = int(config_data.get("port", 587))
        helo_ident = (config_data.get("helo_ident") or "").strip() or None
        auth_type = config_data.get("auth_type", "Standard")
        username = config_data.get("username")
        password = config_data.get("password")
        from_name = config_data.get("from_name", "IoT Guard")
        from_email = config_data.get("from_email", "")

        kwargs = {"timeout": 15}
        if helo_ident:
            kwargs["local_hostname"] = helo_ident

        if security == "SSL":
            server = smtplib.SMTP_SSL(host, port, **kwargs)
        else:
            server = smtplib.SMTP(host, port, **kwargs)
            if security == "TLS":
                server.starttls()

        if auth_type in ("Standard", "SASL") and username and password:
            server.login(username, password)

        msg = MIMEText(f"Hi from IoT Guard!\n\nThis is a system connection test for your SMTP Relay: {config_data.get('name', '')}.\nHELO ID: {helo_ident or 'Default'}")
        msg['Subject'] = "IoT Guard: System Connection Test"
        msg['From'] = f"{from_name} <{from_email}>"
        msg['To'] = test_receiver

        server.sendmail(from_email, [test_receiver], msg.as_string())
        server.quit()
        return True, "Test Email Sent Successfully!"
    except Exception as e:
        logger.error(f"Test SMTP Error: {e}")
        return False, str(e)

def send_alert_email(smtp: models.SMTPConfig, recipients: str, subject: str, body: str):
    try:
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = f"{smtp.from_name} <{smtp.from_email}>"
        msg['To'] = recipients

        helo_ident = (smtp.helo_ident or "").strip() or None
        kwargs = {"timeout": 15}
        if helo_ident:
            kwargs["local_hostname"] = helo_ident

        if smtp.security == "SSL":
            server = smtplib.SMTP_SSL(smtp.host, smtp.port, **kwargs)
        else:
            server = smtplib.SMTP(smtp.host, smtp.port, **kwargs)
            if smtp.security == "TLS":
                server.starttls()

        if smtp.auth_type != "None" and smtp.username and smtp.password:
            server.login(smtp.username, smtp.password)

        recipient_list = [r.strip() for r in recipients.split(',') if r.strip()]
        server.sendmail(smtp.from_email, recipient_list, msg.as_string())
        server.quit()
        logger.info(f"Alert email sent to {recipient_list}")
        return True
    except Exception as e:
        logger.error(f"Alert SMTP Error: {e}")
        return False

def check_alerts(device_id: int, telemetry_data: dict):
    rules = models.AlertRule.objects.filter(device_id=device_id, is_active=True)

    for rule in rules:
        if not rule.sensor_key or rule.sensor_key not in telemetry_data:
            continue

        raw_val = telemetry_data[rule.sensor_key]
        triggered = False

        # Attempt numeric comparison
        try:
            val = float(raw_val)
            cond = float(rule.condition_value) if rule.condition_value is not None else 0.0
            if rule.operator == ">" and val > cond:
                triggered = True
            elif rule.operator == "<" and val < cond:
                triggered = True
            elif rule.operator in ("==", "=") and val == cond:
                triggered = True
            elif rule.operator == ">=" and val >= cond:
                triggered = True
            elif rule.operator == "<=" and val <= cond:
                triggered = True
            elif rule.operator == "!=" and val != cond:
                triggered = True
        except (ValueError, TypeError):
            # Fallback for string / boolean values
            str_val = str(raw_val).strip().lower()
            cond_str = str(rule.condition_value or "").strip().lower()
            if rule.operator in ("==", "=") and str_val == cond_str:
                triggered = True
            elif rule.operator == "!=" and str_val != cond_str:
                triggered = True

        if triggered:
            now = timezone.now()
            cooldown = rule.cooldown_seconds if rule.cooldown_seconds is not None else 300
            if rule.last_triggered:
                last_trig = rule.last_triggered if timezone.is_aware(rule.last_triggered) else timezone.make_aware(rule.last_triggered)
                elapsed = (now - last_trig).total_seconds()
                if elapsed < cooldown:
                    continue

            rule.last_triggered = now
            rule.save(update_fields=["last_triggered"])

            device = Device.objects.filter(id=device_id).first()
            device_name = device.name if device else f"Device #{device_id}"

            template = rule.template or "Alert triggered for {device}: {sensor} = {value}"
            subject = rule.subject or "IoT Alert: {device} ({sensor})"

            msg_body = template.replace("{value}", str(raw_val))
            msg_body = msg_body.replace("{sensor}", str(rule.sensor_key))
            msg_body = msg_body.replace("{device}", device_name)

            msg_subject = subject.replace("{device}", device_name)
            msg_subject = msg_subject.replace("{sensor}", str(rule.sensor_key))

            alert_log = models.AlertLog.objects.create(
                device_id=device_id,
                rule=rule,
                message=msg_body
            )

            smtp = models.SMTPConfig.objects.filter(id=rule.smtp_config_id).first()
            if smtp:
                send_alert_email(smtp, rule.recipients, msg_subject, msg_body)

def process_heartbeat_alerts():
    rules = models.AlertRule.objects.filter(trigger_type='heartbeat', is_active=True)

    for rule in rules:
        device = Device.objects.filter(id=rule.device_id).first()
        if not device or not device.last_seen:
            continue

        now = timezone.now()
        timeout_threshold = rule.condition_value or 5
        last_seen = device.last_seen if timezone.is_aware(device.last_seen) else timezone.make_aware(device.last_seen)
        last_seen_delta = (now - last_seen).total_seconds() / 60

        if last_seen_delta > timeout_threshold:
            cooldown = rule.cooldown_seconds if rule.cooldown_seconds is not None else 300
            if rule.last_triggered:
                last_trig = rule.last_triggered if timezone.is_aware(rule.last_triggered) else timezone.make_aware(rule.last_triggered)
                elapsed_cooldown = (now - last_trig).total_seconds()
                if elapsed_cooldown < cooldown:
                    continue

            rule.last_triggered = now
            rule.save(update_fields=["last_triggered"])

            template = rule.template or "Device {device} offline: Heartbeat lost for {value}"
            subject = rule.subject or "Device Offline Alert: {device}"

            msg_body = template.replace("{device}", device.name)
            msg_body = msg_body.replace("{value}", f"{int(last_seen_delta)} min")
            msg_body = msg_body.replace("{sensor}", "Heartbeat")

            msg_subject = subject.replace("{device}", device.name)

            alert_log = models.AlertLog.objects.create(
                device=device,
                rule=rule,
                message=msg_body
            )

            smtp = models.SMTPConfig.objects.filter(id=rule.smtp_config_id).first()
            if smtp:
                send_alert_email(smtp, rule.recipients, msg_subject, msg_body)

