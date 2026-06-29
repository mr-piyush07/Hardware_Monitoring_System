import asyncio
import json
import logging
import sys
from aiomqtt import Client, MqttError
from app.core.config import settings
from app.core.database import SessionLocal
from app.modules.devices.service import get_device_by_hwid
from app.modules.telemetry.service import create_telemetry

logger = logging.getLogger(__name__)

async def mqtt_consumer():
    """
    MQTT consumer that listens for telemetry from devices.
    """
    reconnect_interval = 5
    client_id = "fastapi_backend_consumer"
    
    print(f"DEBUG: Starting MQTT Consumer with Client ID: {client_id}")
    
    while True:
        try:
            async with Client(
                hostname=settings.MQTT_BROKER_HOST, 
                port=settings.MQTT_BROKER_PORT,
                identifier=client_id,
                clean_session=True
            ) as client:
                print(f"DEBUG: Successfully connected to MQTT Broker at {settings.MQTT_BROKER_HOST}")
                
                # GLOBAL LISTENER: Catch EVERYTHING to verify if broker is even sending messages
                subscribe_topic = "#"
                await client.subscribe(subscribe_topic)
                print(f"DEBUG: GLOBAL LISTENER ACTIVE - Subscribed to EVERYTHING (#)")
                
                # Heartbeat task to ensure loop is running
                async def heartbeat():
                    while True:
                        print("DEBUG: MQTT Consumer is alive and waiting for messages...")
                        await asyncio.sleep(15)
                
                heartbeat_task = asyncio.create_task(heartbeat())

                async for message in client.messages:
                    try:
                        # Extract topic safely
                        topic = str(message.topic)
                        payload_raw = message.payload
                        
                        print(f"\n[GLOBAL LOG] <<< MESSAGE ON TOPIC: {topic} >>>")
                        
                        payload_str = payload_raw.decode()
                        print(f"Payload: {payload_str}")
                        
                        # Process logic
                        topic_parts = topic.split('/')
                        if len(topic_parts) >= 3:
                            hardware_id = topic_parts[2]
                            data = json.loads(payload_str)
                            
                            db = SessionLocal()
                            try:
                                device = get_device_by_hwid(db, hardware_id=hardware_id)
                                if device:
                                    create_telemetry(db, device_id=device.id, data=data)
                                    print(f"SUCCESS: Saved telemetry for {hardware_id}")
                                else:
                                    print(f"WARNING: HWID {hardware_id} not found in DB")
                            finally:
                                db.close()
                        
                    except Exception as e:
                        print(f"ERROR inside message loop: {e}")
                        
        except Exception as e:
            print(f"CRITICAL ERROR in MQTT Consumer: {e}")
            print(f"Attempting reconnect in {reconnect_interval}s...")
            await asyncio.sleep(reconnect_interval)
