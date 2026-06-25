"""Gedeelde dependencies en helpers voor de In Limbo backend."""
from __future__ import annotations
import os
import logging
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("inlimbo")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def strip_mongo(d: dict) -> dict:
    d.pop("_id", None)
    d.pop("_seed", None)
    d.pop("passwordHash", None)
    d.pop("searchKeywords", None)  # server-only field, never expose
    return d


DEFAULT_EMAIL_PREFS = {
    "new_application": True,
    "selected_as_receiver": True,
    "deadline_expired": True,
    "application_withdrawn": True,
    "unrehomed": True,
    "account_validated": True,
}


# Shared rate-limiter (1 instance for slowapi to wire correctly)
from slowapi import Limiter
from slowapi.util import get_remote_address


def get_real_ip(request) -> str:
    """Use X-Forwarded-For (left-most IP) when behind a proxy/ingress; fall back to socket peer."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=get_real_ip)
