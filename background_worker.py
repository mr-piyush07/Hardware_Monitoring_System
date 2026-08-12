import os
import sys
import time
import asyncio
import json
import logging
from datetime import datetime

# Initialize Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'iot_monitoring.settings')

import django
django.setup()

from django.conf import settings
from alerts_app.services import process_heartbeat_alerts
from devices_app.models import Device
from telemetry_app.repository import get_telemetry_repository

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("background_worker")

async def heartbeat_loop():
    logger.info("Heartbeat Monitoring Loop Started.")
    while True:
        try:
            process_heartbeat_alerts()
            logger.info("Executed heartbeat alert check successfully.")
        except Exception as e:
            logger.error(f"Error in Heartbeat Loop: {e}")
        await asyncio.sleep(60)

async def mqtt_consumer():
    """
    Async MQTT Consumer task using aiomqtt.
    Listens for telemetry payloads from direct nodes or LoRa Gateways.
    Supports node_id routing to registered database hardware nodes.
    """
    try:
        from aiomqtt import Client
    except ImportError:
        logger.warning("aiomqtt library not installed. Skipping MQTT consumer.")
        return

    reconnect_interval = 5
    client_id = "django_backend_consumer"

    logger.info(f"Starting MQTT Consumer connecting to {settings.MQTT_BROKER_HOST}:{settings.MQTT_BROKER_PORT}")

    while True:
        try:
            async with Client(
                hostname=settings.MQTT_BROKER_HOST,
                port=settings.MQTT_BROKER_PORT,
                identifier=client_id,
                clean_session=True
            ) as client:
                logger.info(f"Connected to MQTT Broker at {settings.MQTT_BROKER_HOST}")
                await client.subscribe("#")

                async for message in client.messages:
                    try:
                        topic = str(message.topic)
                        payload_str = message.payload.decode()
                        topic_parts = topic.split('/')

                        # Extract hardware_id from topic e.g., v1/devices/HW123 or devices/HW123
                        hwid_from_topic = None
                        for part in reversed(topic_parts):
                            if part and part not in ("telemetry", "data", "v1", "devices", "gateway", "nodes", "sensor"):
                                hwid_from_topic = part
                                break

                        if not hwid_from_topic:
                            continue

                        try:
                            data = json.loads(payload_str)
                        except Exception:
                            data = {"raw": payload_str}

                        sender_device = Device.objects.filter(hardware_id=hwid_from_topic).first()
                        if not sender_device:
                            logger.warning(f"MQTT: Device HWID '{hwid_from_topic}' not found in DB")
                            continue

                        now = datetime.utcnow()
                        sender_device.last_seen = now
                        sender_device.save(update_fields=["last_seen"])

                        # Determine target node if specified in payload (LoRa Gateway forwarding)
                        target_hwid = None
                        if isinstance(data, dict):
                            target_hwid = data.get("node_id") or data.get("hardware_id") or data.get("node")

                        target_device = sender_device
                        if target_hwid and str(target_hwid).strip() != hwid_from_topic:
                            found_node = Device.objects.filter(hardware_id=str(target_hwid).strip()).first()
                            if found_node:
                                target_device = found_node
                                target_device.last_seen = now
                                target_device.save(update_fields=["last_seen"])

                        repo = get_telemetry_repository()
                        repo.create(device_id=target_device.id, data=data if isinstance(data, dict) else {"payload": data})
                        logger.info(f"MQTT: Saved telemetry for node '{target_device.hardware_id}' (via topic HWID '{hwid_from_topic}')")

                        # Alert evaluation
                        try:
                            from alerts_app.services import check_alerts
                            if isinstance(data, dict):
                                check_alerts(target_device.id, data)
                        except Exception as e:
                            logger.error(f"Alert check error in MQTT consumer: {e}")

                    except Exception as e:
                        logger.error(f"Error processing MQTT message: {e}")
        except Exception as e:
            logger.error(f"MQTT Connection Error: {e}. Reconnecting in {reconnect_interval}s...")
            await asyncio.sleep(reconnect_interval)

async def main():
    logger.info("Starting IoT Monitoring Background Worker Services...")
    await asyncio.gather(
        heartbeat_loop(),
        mqtt_consumer()
    )

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Background worker stopped by user.")
