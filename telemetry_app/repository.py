from django.conf import settings
from telemetry_app.models import Telemetry
from devices_app.models import Device
from datetime import datetime
import logging

class BaseTelemetryRepository:
    def create(self, device_id: int, data: dict):
        raise NotImplementedError

    def get_by_device(self, device_id: int, limit: int = 100):
        raise NotImplementedError

    def get_all_for_user(self, user_id: int, limit: int = 50):
        raise NotImplementedError

class DjangoORMRepository(BaseTelemetryRepository):
    """
    Standard ORM Repository for SQLite and PostgreSQL.
    """
    def create(self, device_id: int, data: dict):
        telemetry = Telemetry.objects.create(device_id=device_id, data=data)
        return {
            "id": telemetry.id,
            "device_id": telemetry.device_id,
            "data": telemetry.data,
            "timestamp": telemetry.timestamp.isoformat() if telemetry.timestamp else None,
        }

    def get_by_device(self, device_id: int, limit: int = 100):
        qs = Telemetry.objects.filter(device_id=device_id).order_by("-timestamp")[:limit]
        return [
            {
                "id": t.id,
                "device_id": t.device_id,
                "data": t.data,
                "timestamp": t.timestamp.isoformat() if t.timestamp else None,
            }
            for t in qs
        ]

    def get_all_for_user(self, user_id: int, limit: int = 50):
        qs = Telemetry.objects.filter(device__user_id=user_id).order_by("-timestamp")[:limit]
        return [
            {
                "id": t.id,
                "device_id": t.device_id,
                "data": t.data,
                "timestamp": t.timestamp.isoformat() if t.timestamp else None,
            }
            for t in qs
        ]

class MongoDBRepository(BaseTelemetryRepository):
    """
    Pluggable MongoDB Repository for high-throughput time-series telemetry storage.
    """
    def __init__(self):
        import pymongo
        self.client = pymongo.MongoClient(settings.MONGO_URI)
        self.db = self.client[settings.MONGO_DB_NAME]
        self.collection = self.db["telemetry"]

    def create(self, device_id: int, data: dict):
        doc = {
            "device_id": device_id,
            "data": data,
            "timestamp": datetime.utcnow()
        }
        res = self.collection.insert_one(doc)
        doc["id"] = str(res.inserted_id)
        doc["timestamp"] = doc["timestamp"].isoformat()
        return doc

    def get_by_device(self, device_id: int, limit: int = 100):
        docs = self.collection.find({"device_id": device_id}).sort("timestamp", -1).limit(limit)
        results = []
        for d in docs:
            results.append({
                "id": str(d.get("_id")),
                "device_id": d.get("device_id"),
                "data": d.get("data"),
                "timestamp": d.get("timestamp").isoformat() if hasattr(d.get("timestamp"), "isoformat") else str(d.get("timestamp")),
            })
        return results

    def get_all_for_user(self, user_id: int, limit: int = 50):
        # Fetch device IDs for user via Django ORM Device table
        device_ids = list(Device.objects.filter(user_id=user_id).values_list("id", flat=True))
        docs = self.collection.find({"device_id": {"$in": device_ids}}).sort("timestamp", -1).limit(limit)
        results = []
        for d in docs:
            results.append({
                "id": str(d.get("_id")),
                "device_id": d.get("device_id"),
                "data": d.get("data"),
                "timestamp": d.get("timestamp").isoformat() if hasattr(d.get("timestamp"), "isoformat") else str(d.get("timestamp")),
            })
        return results

def get_telemetry_repository() -> BaseTelemetryRepository:
    if getattr(settings, "DB_ENGINE", "sqlite") == "mongodb":
        try:
            return MongoDBRepository()
        except Exception as e:
            logging.error(f"Failed to connect to MongoDB, falling back to ORM: {e}")
            return DjangoORMRepository()
    return DjangoORMRepository()
