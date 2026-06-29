import logging
import redis.asyncio as redis
from app.core.config import settings

# In-memory fallback for local development if Redis is missing
class FakeRedis:
    def __init__(self):
        self._data = {}
        logging.warning("Using In-Memory FakeRedis (Sessions will be lost on restart)")

    async def get(self, key):
        return self._data.get(key)

    async def setex(self, key, time, value):
        self._data[key] = value
        return True

    async def delete(self, key):
        if key in self._data:
            del self._data[key]
        return True

    async def ping(self):
        return True

    async def close(self):
        pass

class RedisSession:
    _instance = None

    def __init__(self):
        self.client = None

    @classmethod
    async def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
            try:
                # Try real redis
                client = redis.from_url(
                    settings.REDIS_URL, 
                    encoding="utf-8", 
                    decode_responses=True,
                    socket_connect_timeout=2
                )
                await client.ping()
                cls._instance.client = client
            except Exception:
                # Fallback to FakeRedis
                cls._instance.client = FakeRedis()
        return cls._instance.client

async def get_redis():
    return await RedisSession.get_instance()
