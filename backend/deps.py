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
    return d


DEFAULT_EMAIL_PREFS = {
    "new_application": True,
    "selected_as_receiver": True,
    "deadline_expired": True,
    "application_withdrawn": True,
    "unrehomed": True,
    "account_validated": True,
}
