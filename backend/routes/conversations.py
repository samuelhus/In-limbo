"""Direct messaging tussen aanbieder en aanvrager van een listing.

Fase 1 (zie PRD_direct_messaging.md): datamodel + kernroutes — gesprek
starten, berichten ophalen/versturen, als gelezen markeren. Bewust NIET in
deze fase: bijlagen, blokkeren, verwijderen/archiveren, notificaties/e-mail.

Een Conversation is 1-op-1 gekoppeld aan een Application (dus impliciet aan
één listing + één aanvrager/aanbieder-paar). offererUserId wordt nergens
opgeslagen — steeds live afgeleid via Listing.userId, zodat er geen
verouderde kopie kan ontstaan (bv. als een listing ooit van eigenaar zou
wisselen).
"""
from __future__ import annotations
import time
import uuid
from collections import defaultdict

from fastapi import APIRouter, HTTPException, Depends, Query

from deps import db, now_iso, strip_mongo
from models import ConversationCreate, MessageCreate
from auth import get_donateur_or_validated_user

router = APIRouter()


# ---------------------------------------------------------------------------
# Simpele per-gebruiker rate limit op het versturen van berichten.
#
# In-memory (geen aparte Mongo-collectie of Redis) — bewust, sluit aan bij
# PRD §9: "geen zware infra nodig, simpele counter volstaat voor v1-volumes".
# Overleeft geen herstart of meerdere workers; voor de huidige schaal van dit
# platform is dat een aanvaardbare beperking (zelfde aanname als elders).
# ---------------------------------------------------------------------------
MESSAGE_RATE_LIMIT = 20  # berichten
MESSAGE_RATE_WINDOW = 60  # seconden
_message_send_times: dict[str, list[float]] = defaultdict(list)


def _check_message_rate_limit(user_id: str) -> None:
    now = time.monotonic()
    window_start = now - MESSAGE_RATE_WINDOW
    times = [t for t in _message_send_times[user_id] if t > window_start]
    if len(times) >= MESSAGE_RATE_LIMIT:
        _message_send_times[user_id] = times
        raise HTTPException(429, "Te veel berichten verstuurd. Probeer het straks opnieuw.")
    times.append(now)
    _message_send_times[user_id] = times


def _serialize_conversation(doc: dict, offerer_user_id: str) -> dict:
    out = strip_mongo(dict(doc))
    out["offererUserId"] = offerer_user_id
    return out


def _serialize_message(doc: dict) -> dict:
    return strip_mongo(dict(doc))


async def _load_conversation(conversation_id: str, user: dict) -> tuple[dict, str, str]:
    """Haalt een Conversation op + bepaalt de rol van de aanroeper.

    Returns (conversation, offerer_user_id, role) met role "offerer" of
    "requester". Gooit 404 als het gesprek (of de onderliggende listing)
    niet bestaat, 403 als de aanroeper geen van beide partijen is.
    """
    conversation = await db.conversations.find_one({"id": conversation_id})
    if not conversation:
        raise HTTPException(404, "Gesprek niet gevonden")
    listing = await db.listings.find_one({"id": conversation["listingId"]}, {"_id": 0, "userId": 1})
    if not listing:
        raise HTTPException(404, "Aanbieding van dit gesprek niet gevonden")
    offerer_user_id = listing["userId"]

    if user["id"] == offerer_user_id:
        role = "offerer"
    elif user["id"] == conversation["requesterUserId"]:
        role = "requester"
    else:
        raise HTTPException(403, "Enkel de aanbieder of aanvrager van deze aanvraag heeft toegang tot dit gesprek")
    return conversation, offerer_user_id, role


@router.post("/conversations")
async def create_conversation(body: ConversationCreate, user: dict = Depends(get_donateur_or_validated_user)):
    application = await db.applications.find_one({"id": body.applicationId})
    if not application:
        raise HTTPException(404, "Aanvraag niet gevonden")
    listing = await db.listings.find_one({"id": application["listingId"]}, {"_id": 0, "userId": 1})
    if not listing:
        raise HTTPException(404, "Aanbieding niet gevonden")
    if listing["userId"] != user["id"]:
        raise HTTPException(403, "Enkel de aanbieder van deze aanvraag kan een gesprek starten")

    # Idempotent: een 2de "Start gesprek"-klik (dubbele klik, refresh, ...)
    # geeft gewoon het bestaande gesprek terug i.p.v. een foutmelding.
    existing = await db.conversations.find_one({"applicationId": body.applicationId})
    if existing:
        return _serialize_conversation(existing, listing["userId"])

    now = now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "applicationId": body.applicationId,
        "listingId": application["listingId"],
        "requesterUserId": application["applicantUserId"],
        "createdAt": now,
        "lastMessageAt": None,
        "lastMessagePreview": None,
    }
    await db.conversations.insert_one(doc)
    return _serialize_conversation(doc, listing["userId"])


@router.get("/conversations/{conversation_id}/messages")
async def list_messages(
    conversation_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_donateur_or_validated_user),
):
    await _load_conversation(conversation_id, user)
    total = await db.messages.count_documents({"conversationId": conversation_id})
    cursor = db.messages.find({"conversationId": conversation_id}).sort("createdAt", 1).skip(skip).limit(limit)
    items = [_serialize_message(m) async for m in cursor]
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str, body: MessageCreate, user: dict = Depends(get_donateur_or_validated_user),
):
    conversation, offerer_user_id, role = await _load_conversation(conversation_id, user)

    # Asymmetrie-regel (PRD §3): de aanvrager mag pas berichten sturen nadat
    # de aanbieder als eerste iets gestuurd heeft in dit gesprek. Voor de
    # aanbieder geldt geen beperking (mag ook het allereerste bericht sturen).
    if role == "requester":
        offerer_has_sent = await db.messages.count_documents(
            {"conversationId": conversation_id, "senderId": offerer_user_id}, limit=1,
        )
        if not offerer_has_sent:
            raise HTTPException(
                403, "Wacht tot de aanbieder het gesprek geopend heeft voor je kan reageren",
            )

    _check_message_rate_limit(user["id"])

    now = now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "conversationId": conversation_id,
        "senderId": user["id"],
        "text": body.text,
        "createdAt": now,
        "readAt": None,
    }
    await db.messages.insert_one(doc)

    preview = body.text if len(body.text) <= 100 else body.text[:99] + "…"
    await db.conversations.update_one(
        {"id": conversation_id},
        {"$set": {"lastMessageAt": now, "lastMessagePreview": preview}},
    )
    return _serialize_message(doc)


@router.patch("/conversations/{conversation_id}/read")
async def mark_conversation_read(conversation_id: str, user: dict = Depends(get_donateur_or_validated_user)):
    await _load_conversation(conversation_id, user)
    result = await db.messages.update_many(
        {"conversationId": conversation_id, "senderId": {"$ne": user["id"]}, "readAt": None},
        {"$set": {"readAt": now_iso()}},
    )
    return {"ok": True, "modified": result.modified_count}
