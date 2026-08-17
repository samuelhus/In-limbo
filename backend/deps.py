"""Gedeelde dependencies en helpers voor de In Limbo backend."""
from __future__ import annotations
import os
import re
import logging
import unicodedata
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("inlimbo")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def anonymize_user(db, user_id: str) -> None:
    """GDPR-verwijdering: vervangt persoonsgegevens door anonieme placeholders,
    maar behoudt het document zelf (en dus zijn id) zodat listings/aanvragen
    die naar deze gebruiker verwijzen geldig blijven — de naam die daar
    getoond wordt, wordt via deze functie automatisch 'Verwijderde gebruiker'.

    Structurele data (listings, aanvragen, platform_transfers, checkins,
    checkouts) wordt hier bewust NIET aangeraakt — die bevat geen
    persoonsgegevens (enkel organisatie-/materiaaldata) en blijft dus intact
    voor statistieken en de historiek van andere gebruikers/organisaties.
    """
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "firstName": "Verwijderde",
            "lastName": "gebruiker",
            "username": None,
            "email": f"verwijderd-{user_id}@inlimbo.brussels",
            "phone": None,
            "passwordHash": "!",  # onbruikbaar, kan nooit matchen met verify_password
            "status": "rejected",
            "deletedAt": now_iso(),
        }},
    )
    await db.notifications.delete_many({"userId": user_id})


def strip_mongo(d: dict) -> dict:
    d.pop("_id", None)
    d.pop("_seed", None)
    d.pop("passwordHash", None)
    d.pop("searchKeywords", None)  # server-only field, never expose
    return d


def slugify(text: str) -> str:
    """Zet een naam om in een URL-vriendelijke slug, bv. 'De Kringwinkel Gent!' -> 'de-kringwinkel-gent'."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "organisatie"


async def generate_unique_org_slug(db, name: str, org_id: str | None = None) -> str:
    """Genereert een unieke slug voor een organisatie. Bij een naamsbotsing wordt -2, -3, ... toegevoegd."""
    base = slugify(name)
    slug = base
    counter = 2
    while True:
        query = {"slug": slug}
        if org_id:
            query["id"] = {"$ne": org_id}
        existing = await db.organisations.find_one(query, {"_id": 0, "id": 1})
        if not existing:
            return slug
        slug = f"{base}-{counter}"
        counter += 1


async def generate_unique_listing_slug(db, title: str, listing_id: str | None = None) -> str:
    """Genereert een unieke slug voor een aanbieding, op basis van de titel.
    Bij een naamsbotsing wordt -2, -3, ... toegevoegd (zelfde patroon als organisaties)."""
    base = slugify(title) if title else "aanbieding"
    slug = base
    counter = 2
    while True:
        query = {"slug": slug}
        if listing_id:
            query["id"] = {"$ne": listing_id}
        existing = await db.listings.find_one(query, {"_id": 0, "id": 1})
        if not existing:
            return slug
        slug = f"{base}-{counter}"
        counter += 1


async def generate_unique_search_request_slug(db, project_name: str | None, search_request_id: str | None = None) -> str:
    """Genereert een unieke slug voor een zoekertje, op basis van de projectnaam
    (zelfde patroon als listings/organisaties). Admin-aangemaakte zoekertjes hebben
    soms geen projectnaam, vandaar de fallback."""
    base = slugify(project_name) if project_name else "zoekertje"
    slug = base
    counter = 2
    while True:
        query = {"slug": slug}
        if search_request_id:
            query["id"] = {"$ne": search_request_id}
        existing = await db.search_requests.find_one(query, {"_id": 0, "id": 1})
        if not existing:
            return slug
        slug = f"{base}-{counter}"
        counter += 1


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
