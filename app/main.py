from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import logging

from app.core.config import settings
from app.core.database import engine, Base
from app.modules.auth.routes import router as auth_router
from app.modules.devices.routes import router as devices_router
from app.modules.telemetry.routes import router as telemetry_router
from app.modules.alerts.routes import router as alerts_router
from app.modules.tickets.routes import router as tickets_router
from app.modules.mqtt.service import mqtt_consumer

# Create tables (In a production app, use Alembic)
Base.metadata.create_all(bind=engine)

logging.basicConfig(level=logging.INFO)

app = FastAPI(title=settings.PROJECT_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(devices_router)
app.include_router(telemetry_router)
app.include_router(alerts_router)
app.include_router(tickets_router)

from app.core.redis import get_redis

async def heartbeat_task():
    from app.modules.alerts.service import process_heartbeat_alerts
    from app.core.database import SessionLocal
    while True:
        try:
            db = SessionLocal()
            process_heartbeat_alerts(db)
            db.close()
        except Exception as e:
            logging.error(f"Heartbeat Task Error: {e}")
        await asyncio.sleep(60)

@app.on_event("startup")
async def startup_event():
    # Initialize Redis
    try:
        redis_client = await get_redis()
        await redis_client.ping()
        logging.info("Connected to Redis successfully.")
    except Exception as e:
        logging.error(f"Could not connect to Redis: {e}")
    
    # Start Heartbeat Monitor
    asyncio.create_task(heartbeat_task())
    
    # Temporarily disabled as MQTT broker is not working
    # asyncio.create_task(mqtt_consumer())

@app.get("/")
async def root():
    return {"message": "Welcome to IoT Monitoring Platform API"}
