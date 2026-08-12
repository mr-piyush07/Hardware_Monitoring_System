import logging
import redis as sync_redis
from django.conf import settings

class FakeRedis:
    _data = {}

    def __init__(self):
        logging.warning("Using In-Memory FakeRedis (Sessions will be lost on restart)")

    def get(self, key):
        return self._data.get(key)

    def setex(self, key, time, value):
        self._data[key] = value
        return True

    def delete(self, key):
        if key in self._data:
            del self._data[key]
        return True

    def ping(self):
        return True

class RedisSession:
    _client = None

    @classmethod
    def get_client(cls):
        if cls._client is None:
            try:
                client = sync_redis.from_url(
                    settings.REDIS_URL,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_connect_timeout=2
                )
                client.ping()
                cls._client = client
            except Exception:
                cls._client = FakeRedis()
        return cls._client

def get_redis():
    return RedisSession.get_client()

def save_session(token: str, email: str, expires_in_minutes: int):
    client = get_redis()
    client.setex(f"session:{token}", expires_in_minutes * 60, email)

def delete_session(token: str):
    client = get_redis()
    client.delete(f"session:{token}")

def get_session(token: str):
    client = get_redis()
    return client.get(f"session:{token}")
