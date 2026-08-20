"""Direct messaging tussen aanbieder en aanvrager van een listing.

Fase 1 (zie PRD_direct_messaging.md): datamodel + kernroutes — gesprek
starten, berichten ophalen/versturen, als gelezen markeren.
Fase 2: bijlagen bij berichten (PRD §6.2/§7), met een cumulatieve limiet
per Conversation.
Fase 3: blokkeren en verwijderen/archiveren per gesprek (PRD §6.4/§6.5).
Fase 4: in-app notificatie voor de ontvanger bij elk nieuw bericht (PRD §6.6),
hergebruik van notifications.create_notification.
Fase 5: de e-maildigest-logica uit PRD §6.6 — dit bestand zet enkel
{offerer,requester}UnreadSince (bij een nieuw bericht, als er nog geen
lopende ongelezen-periode was) en reset het bij het lezen; de scheduled job
die de bundel-mail effectief verstuurt staat in tasks.py::send_message_email_reminders
(geregistreerd op de bestaande APScheduler in server.py).
Fase 6: GET /conversations/unread-count, een lichtgewicht route voor de
badge op de "Berichten"-tab in de hoofdnav (PRD §6.3) — telt gesprekken
met ongelezen berichten, niet het volledige GET /conversations/mine uit
PRD §8 (die kwam pas met de gesprekslijst hieronder).
Fase 7: de eigenlijke chat-UI — GET /conversations/mine (gesprekslijst,
PRD §6.3/§8) en GET /conversations/{id} (detail voor de header van het
gespreksvenster), beide via _enrich_conversations hieronder verrijkt met
listingtitel en de weergavenaam van de andere partij.
Fase 9 (dit, op vraag van product na de eerste UI-doorloop van fase 6-8):
- "Afgehandeld" als apart, omkeerbaar statusveld (handledBy) naast — niet
  i.p.v. — de bestaande verwijder/verberg-functie (hiddenBy): mark-handled/
  unmark-handled hieronder, plus automatisch weer "in behandeling" zodra er
  een nieuw bericht binnenkomt (zelfde patroon als hiddenBy in send_message).
- Bijlagen worden nu ook echt op Cloudinary verwijderd (niet enkel de
  referentie) zodra BEIDE partijen een gesprek verwijderd hebben — zie
  _purge_conversation_attachments/hide_conversation.
- Weergavenaam-formaat aangepast: "Voornaam van Organisatienaam" i.p.v.
  enkel de organisatienaam — zie _format_display_name.

Een Conversation is 1-op-1 gekoppeld aan een Application (dus impliciet aan
één listing + één aanvrager/aanbieder-paar). offererUserId wordt nergens
opgeslagen — steeds live afgeleid via Listing.userId, zodat er geen
verouderde kopie kan ontstaan (bv. als een listing ooit van eigenaar zou
wisselen).
"""
from __future__ import annotations
import logging
import re
import time
import uuid
from collections import defaultdict

import cloudinary.uploader
from fastapi import APIRouter, HTTPException, Depends, Query

from deps import db, now_iso, strip_mongo
from models import (
    ConversationCreate, MessageCreate,
    MAX_CONVERSATION_ATTACHMENTS, MAX_CONVERSATION_ATTACHMENT_BYTES,
)
from auth import get_donateur_or_validated_user
from notifications import create_notification

router = APIRouter()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Fase 9: bijlagen echt verwijderen op Cloudinary zodra beide partijen een
# gesprek verwijderd hebben (zie hide_conversation). cloudinary.config() is
# al globaal gezet in server.py bij het opstarten, dus hier enkel de
# uploader-call zelf — geen nieuwe credentials/infra nodig.
# ---------------------------------------------------------------------------
_CLOUDINARY_PUBLIC_ID_RE = re.compile(r"/upload/(?:[^/]+/)*?v\d+/(.+)$")


def _cloudinary_public_id_from_url(url: str, resource_type: str) -> str | None:
    """Leidt de public_id af uit een secure_url zoals Cloudinary die teruggeeft
    bij upload (zie frontend/src/lib/cloudinary.js). Voor resource_type
    "image" maakt Cloudinary een apart formaat-veld van de extensie (die dus
    niet bij de public_id hoort); voor "raw" (PDF's) is de extensie wél
    onderdeel van de public_id. Geeft None terug bij een onherkenbare vorm
    (bv. de vaste demo-URL's in tests) — de aanroeper behandelt dat als
    "niets te verwijderen", niet als een fout."""
    match = _CLOUDINARY_PUBLIC_ID_RE.search(url)
    if not match:
        return None
    tail = match.group(1)
    if resource_type == "image":
        tail = re.sub(r"\.[a-zA-Z0-9]+$", "", tail)
    return tail


def _destroy_cloudinary_asset(url: str, resource_type: str) -> None:
    """Best-effort verwijdering — een falende Cloudinary-call mag het
    verwijderen van het gesprek zelf nooit blokkeren (het is opruiming
    achteraf, geen kernfunctionaliteit)."""
    public_id = _cloudinary_public_id_from_url(url, resource_type)
    if not public_id:
        return
    try:
        cloudinary.uploader.destroy(public_id, resource_type=resource_type)
    except Exception:
        logger.warning("Cloudinary-verwijdering mislukt voor %s (%s)", public_id, resource_type, exc_info=True)


async def _purge_conversation_attachments(conversation_id: str) -> None:
    """Verwijdert alle bijlagen van een gesprek, zowel op Cloudinary als de
    referenties op de berichten zelf, en zet de cumulatieve tellers op het
    Conversation-document terug op 0. Wordt enkel aangeroepen wanneer beide
    partijen het gesprek verwijderd hebben (zie hide_conversation) — op dat
    moment kan geen van beide de bijlagen nog nodig hebben."""
    cursor = db.messages.find(
        {"conversationId": conversation_id, "$or": [{"photos.0": {"$exists": True}}, {"files.0": {"$exists": True}}]},
    )
    async for message in cursor:
        for photo in message.get("photos", []):
            _destroy_cloudinary_asset(photo["url"], "image")
        for file in message.get("files", []):
            _destroy_cloudinary_asset(file["url"], "raw")
    await db.messages.update_many(
        {"conversationId": conversation_id}, {"$set": {"photos": [], "files": []}},
    )
    await db.conversations.update_one(
        {"id": conversation_id}, {"$set": {"attachmentCount": 0, "attachmentBytes": 0}},
    )


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


def _serialize_conversation(doc: dict, offerer_user_id: str, viewer_user_id: str) -> dict:
    out = strip_mongo(dict(doc))
    out["offererUserId"] = offerer_user_id
    # Defaults voor gesprekken die aangemaakt zijn vóór fase 2 (bijlagen).
    out.setdefault("attachmentCount", 0)
    out.setdefault("attachmentBytes", 0)

    # blockedBy/hiddenBy/handledBy zijn arrays van userId's (zie models.py) —
    # nooit rechtstreeks exposen, enkel de per-viewer afgeleide booleans
    # (PRD §7). handledBy (fase 9) is puur organisatorisch ("afgehandeld"),
    # los van hiddenBy (echt verwijderen/verbergen, PRD §6.5) — zie
    # mark_conversation_handled/unmark_conversation_handled.
    blocked_by = out.pop("blockedBy", [])
    hidden_by = out.pop("hiddenBy", [])
    handled_by = out.pop("handledBy", [])
    other_user_id = out["requesterUserId"] if viewer_user_id == offerer_user_id else offerer_user_id
    out["blockedByMe"] = viewer_user_id in blocked_by
    out["blockedByOther"] = other_user_id in blocked_by
    out["hiddenByMe"] = viewer_user_id in hidden_by
    out["handledByMe"] = viewer_user_id in handled_by

    # E-maildigest-boekhouding (fase 5, PRD §6.6/§7) — puur interne server-
    # state voor de scheduled job in tasks.py, geen publiek API-contract.
    out.pop("offererUnreadSince", None)
    out.pop("offererEmailSentAt", None)
    out.pop("requesterUnreadSince", None)
    out.pop("requesterEmailSentAt", None)
    return out


def _serialize_message(doc: dict) -> dict:
    return strip_mongo(dict(doc))


def _my_conversations_filter(user_id: str, listing_ids: list[str]) -> dict:
    """Mongo-filter voor "mijn gesprekken" — gedeeld tussen /unread-count en
    /mine zodat beide exact dezelfde set gesprekken tellen/tonen. offererUserId
    staat niet op het Conversation-document (zie module-docstring), dus "mijn
    gesprekken als aanbieder" loopt via de listings die ik zelf bezit."""
    return {
        "$or": [
            {"requesterUserId": user_id},
            {"listingId": {"$in": listing_ids}},
        ],
        # Verborgen gesprekken (PRD §6.5) tellen niet mee: een nieuw bericht
        # haalt de ontvanger sowieso al uit hiddenBy (zie send_message), dus
        # dit sluit enkel bewust gearchiveerde, reeds geziene gesprekken uit.
        "hiddenBy": {"$ne": user_id},
    }


def _format_display_name(user_doc: dict, org_doc: dict | None) -> str | None:
    """Weergavenaam voor de messaging-UI (fase 9, op vraag van product):
    "Voornaam van Organisatienaam" i.p.v. enkel de organisatienaam — een
    kale bedrijfs-/orgnaam maakt in een 1-op-1-gesprek niet duidelijk wie
    er nu precies aan het typen is.

    - Gevalideerd lid van een organisatie: "{voornaam} van {orgnaam}".
    - Bedrijfs-donateur (geen organisationId, wel companyName): "{voornaam}
      van {companyName}" — donorType "bedrijf" vereist firstName+companyName
      bij registratie (zie RegisterDonateur in models.py), dus dit is altijd
      compleet beschikbaar.
    - Particuliere donateur: enkel de username (bewust — dat is exact hun
      publieke identificatiemiddel, zie RegisterDonateur-docstring; geen
      achternaam/voornaam tonen aan de andere partij).
    - Overige gevallen (geen organisatie/donateurprofiel bekend): voornaam +
      achternaam, of anders de username.
    """
    if not user_doc:
        return None
    first_name = user_doc.get("firstName")
    if org_doc and org_doc.get("name"):
        return f"{first_name} van {org_doc['name']}" if first_name else org_doc["name"]
    if user_doc.get("role") == "donateur":
        if user_doc.get("donorType") == "bedrijf" and user_doc.get("companyName"):
            return f"{first_name} van {user_doc['companyName']}" if first_name else user_doc["companyName"]
        return user_doc.get("username")
    full_name = f'{first_name or ""} {user_doc.get("lastName", "")}'.strip()
    return full_name or user_doc.get("username")


async def _enrich_conversations(docs: list[dict], viewer_id: str) -> list[dict]:
    """Verrijkt ruwe Conversation-documenten met wat de gesprekslijst en het
    gespreksvenster nodig hebben, maar wat niet op het document zelf staat:
    listingtitel + -foto, de weergavenaam van de andere partij én van de
    viewer zelf (voor de afzendernaam bij eigen berichten, zie
    GesprekDetail.jsx), en het aantal ongelezen berichten in dat gesprek.
    Behoudt de volgorde van `docs` (de aanroeper bepaalt de sortering
    vooraf, bv. op lastMessageAt)."""
    if not docs:
        return []

    listing_ids = list({d["listingId"] for d in docs})
    listings = {
        l["id"]: l async for l in db.listings.find(
            {"id": {"$in": listing_ids}}, {"_id": 0, "id": 1, "title": 1, "userId": 1, "photos": 1},
        )
    }

    # offererUserId per gesprek live afleiden (zie module-docstring), en
    # meteen bepalen wie voor déze viewer "de andere partij" is.
    relevant_user_ids: set[str] = {viewer_id}
    for d in docs:
        listing = listings.get(d["listingId"])
        offerer_id = listing["userId"] if listing else None
        other_id = d["requesterUserId"] if viewer_id == offerer_id else offerer_id
        d["_offererUserId"] = offerer_id
        d["_otherUserId"] = other_id
        if other_id:
            relevant_user_ids.add(other_id)

    users = {
        u["id"]: u async for u in db.users.find(
            {"id": {"$in": list(relevant_user_ids)}},
            {
                "_id": 0, "id": 1, "firstName": 1, "lastName": 1, "username": 1,
                "organisationId": 1, "role": 1, "donorType": 1, "companyName": 1,
            },
        )
    }
    org_ids = [u["organisationId"] for u in users.values() if u.get("organisationId")]
    orgs = {
        o["id"]: o async for o in db.organisations.find({"id": {"$in": org_ids}}, {"_id": 0, "id": 1, "name": 1})
    }

    def _name_for(user_id: str | None) -> str | None:
        user_doc = users.get(user_id) if user_id else None
        if not user_doc:
            return None
        return _format_display_name(user_doc, orgs.get(user_doc.get("organisationId")))

    viewer_name = _name_for(viewer_id)

    # Ongelezen-telling per gesprek in 1 aggregatie i.p.v. een query per
    # gesprek — zelfde criterium als /unread-count (bericht van de andere
    # partij, nog niet gelezen door de viewer).
    conversation_ids = [d["id"] for d in docs]
    unread_counts: dict[str, int] = {}
    pipeline = [
        {"$match": {"conversationId": {"$in": conversation_ids}, "senderId": {"$ne": viewer_id}, "readAt": None}},
        {"$group": {"_id": "$conversationId", "count": {"$sum": 1}}},
    ]
    async for row in db.messages.aggregate(pipeline):
        unread_counts[row["_id"]] = row["count"]

    out = []
    for d in docs:
        listing = listings.get(d["listingId"])
        offerer_id = d.pop("_offererUserId")
        other_id = d.pop("_otherUserId")
        serialized = _serialize_conversation(d, offerer_id, viewer_id)
        serialized["listingTitle"] = listing.get("title") if listing else None
        serialized["listingPhoto"] = (listing.get("photos") or [None])[0] if listing else None
        serialized["otherPartyName"] = _name_for(other_id)
        serialized["viewerName"] = viewer_name
        serialized["unreadCount"] = unread_counts.get(d["id"], 0)
        out.append(serialized)
    return out


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
        return _serialize_conversation(existing, listing["userId"], user["id"])

    now = now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "applicationId": body.applicationId,
        "listingId": application["listingId"],
        "requesterUserId": application["applicantUserId"],
        "createdAt": now,
        "lastMessageAt": None,
        "lastMessagePreview": None,
        "attachmentCount": 0,
        "attachmentBytes": 0,
        "blockedBy": [],
        "hiddenBy": [],
        "handledBy": [],  # "afgehandeld" per gebruiker (fase 9) — zie mark/unmark_conversation_handled
        # E-maildigest-boekhouding per partij (PRD §6.6/§7) — None = geen
        # lopende ongelezen-periode. Zie send_message/mark_conversation_read
        # en tasks.py::send_message_email_reminders.
        "offererUnreadSince": None,
        "offererEmailSentAt": None,
        "requesterUnreadSince": None,
        "requesterEmailSentAt": None,
    }
    await db.conversations.insert_one(doc)
    return _serialize_conversation(doc, listing["userId"], user["id"])


@router.get("/conversations/unread-count")
async def unread_conversation_count(user: dict = Depends(get_donateur_or_validated_user)):
    """Aantal gesprekken met minstens 1 ongelezen bericht voor de ingelogde
    gebruiker (PRD §6.3, fase 6) — voedt de badge op de "Berichten"-tab in
    de hoofdnav. Telt gesprekken, niet losse berichten, zoals de PRD
    voorschrijft. Blijft bestaan naast het (intussen gebouwde, fase 7)
    GET /conversations/mine hieronder: de badge in Header.jsx pollt dit
    lichtgewicht aantal, zonder de volledige lijst met listingtitels en
    laatste-berichtfragmenten mee te moeten sturen.
    """
    listing_ids = [
        doc["id"] async for doc in db.listings.find({"userId": user["id"]}, {"_id": 0, "id": 1})
    ]
    conversation_ids = [
        doc["id"] async for doc in db.conversations.find(
            _my_conversations_filter(user["id"], listing_ids), {"_id": 0, "id": 1},
        )
    ]
    if not conversation_ids:
        return {"count": 0}
    unread_conversation_ids = await db.messages.distinct(
        "conversationId",
        {
            "conversationId": {"$in": conversation_ids},
            "senderId": {"$ne": user["id"]},
            "readAt": None,
        },
    )
    return {"count": len(unread_conversation_ids)}


@router.get("/conversations/mine")
async def list_my_conversations(user: dict = Depends(get_donateur_or_validated_user)):
    """Gesprekslijst (PRD §6.3/§8, fase 7): naam tegenpartij, listingtitel,
    laatste berichtfragment, tijdstip en ongelezen-indicator per gesprek —
    verborgen gesprekken (PRD §6.5) niet meegeteld, zelfde filter als
    /unread-count. Nieuwste gesprek eerst; gesprekken zonder berichten
    (net gestart, aanbieder heeft nog niets gestuurd) vallen op createdAt
    terug en komen achteraan te staan."""
    listing_ids = [
        doc["id"] async for doc in db.listings.find({"userId": user["id"]}, {"_id": 0, "id": 1})
    ]
    cursor = db.conversations.find(
        _my_conversations_filter(user["id"], listing_ids),
    ).sort([("lastMessageAt", -1), ("createdAt", -1)])
    docs = [doc async for doc in cursor]
    return await _enrich_conversations(docs, user["id"])


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, user: dict = Depends(get_donateur_or_validated_user)):
    """Detail van 1 gesprek (fase 7) — voedt de header van het gespreksvenster
    (naam andere partij, listingtitel, blokkade-status) met dezelfde
    verrijking als /mine. Moet ná /mine en /unread-count geregistreerd staan:
    anders zou FastAPI die twee statische paden als een {conversation_id}
    van "mine"/"unread-count" behandelen."""
    conversation, _offerer_user_id, _role = await _load_conversation(conversation_id, user)
    enriched = await _enrich_conversations([conversation], user["id"])
    return enriched[0]


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
    other_party_id = offerer_user_id if role == "requester" else conversation["requesterUserId"]

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

    # Blokkeren (PRD §6.4): enkel de geblokkeerde partij wordt beperkt — wie
    # zelf blokkeert kan nog gewoon verder berichten (geen wederzijdse
    # opschorting, zie PRD). Geschiedenis blijft voor iedereen zichtbaar,
    # dus enkel het versturen wordt hier tegengehouden, niet GET/read.
    if other_party_id in conversation.get("blockedBy", []):
        raise HTTPException(
            403, "Je kan geen berichten meer sturen in dit gesprek — de andere partij heeft je geblokkeerd.",
        )

    # Cumulatieve bijlage-limiet per Conversation (PRD §6.2), niet per
    # bericht: check vóór het bericht aanvaard wordt, tegen de lopende
    # totalen op het Conversation-document (attachmentCount/attachmentBytes,
    # bijgewerkt bij elk eerder bericht met bijlage — zie onderaan).
    new_attachments = len(body.photos) + len(body.files)
    new_bytes = sum(a.bytes for a in body.photos) + sum(a.bytes for a in body.files)
    if new_attachments:
        prospective_count = conversation.get("attachmentCount", 0) + new_attachments
        prospective_bytes = conversation.get("attachmentBytes", 0) + new_bytes
        if prospective_count > MAX_CONVERSATION_ATTACHMENTS or prospective_bytes > MAX_CONVERSATION_ATTACHMENT_BYTES:
            raise HTTPException(
                413,
                "Bijlage-limiet voor dit gesprek is bereikt (max 5 foto's/bestanden, "
                "20 MB in totaal) — gelieve verder uit te wisselen via e-mail.",
            )

    _check_message_rate_limit(user["id"])

    now = now_iso()
    photos = [a.model_dump() for a in body.photos]
    files = [a.model_dump() for a in body.files]
    doc = {
        "id": str(uuid.uuid4()),
        "conversationId": conversation_id,
        "senderId": user["id"],
        "text": body.text,
        "photos": photos,
        "files": files,
        "createdAt": now,
        "readAt": None,
    }
    await db.messages.insert_one(doc)

    preview = body.text if len(body.text) <= 100 else body.text[:99] + "…"
    recipient_prefix = "offerer" if other_party_id == offerer_user_id else "requester"
    set_fields: dict = {"lastMessageAt": now, "lastMessagePreview": preview}
    # E-maildigest (PRD §6.6/fase 5): start een ongelezen-periode voor de
    # ontvanger, maar enkel als er nog geen lopende was — een 2de, 3de
    # bericht in dezelfde burst mag unreadSince niet vooruitschuiven, anders
    # zou de 30-minuten-klok telkens herstarten en nooit aflopen. De
    # scheduled job in tasks.py::send_message_email_reminders bundelt
    # alles sinds dat eerste tijdstip in één mail.
    if not conversation.get(f"{recipient_prefix}UnreadSince"):
        set_fields[f"{recipient_prefix}UnreadSince"] = now
    update: dict = {
        "$set": set_fields,
        # PRD §6.5: als de ontvanger dit gesprek eerder bij zichzelf
        # verwijderd/verborgen had, laat een nieuw bericht het terugkeren
        # in hun lijst. Enkel de ontvanger — de eigen hidden-status van de
        # verzender (indien die het ooit zelf verwijderde) blijft staan.
        # Zelfde redenering voor "afgehandeld" (fase 9): nieuwe activiteit
        # betekent dat het voor de ontvanger niet langer afgehandeld is.
        "$pull": {"hiddenBy": other_party_id, "handledBy": other_party_id},
    }
    if new_attachments:
        update["$inc"] = {"attachmentCount": new_attachments, "attachmentBytes": new_bytes}
    await db.conversations.update_one({"id": conversation_id}, update)

    # In-app notificatie voor de ontvanger (PRD §6.6), zelfde patroon als
    # bv. new_application in routes/applications.py: hergebruik van
    # create_notification, met de listing als context. Geen aparte
    # blokkade-check nodig hier — als de ontvanger (other_party_id) de
    # verzender geblokkeerd had, was send_message hierboven al met 403
    # gestopt vóór het bericht ooit werd opgeslagen.
    listing = await db.listings.find_one({"id": conversation["listingId"]}, {"_id": 0, "title": 1})
    listing_title = listing.get("title") if listing else None
    sender_org_name = None
    if user.get("organisationId"):
        sender_org = await db.organisations.find_one({"id": user["organisationId"]}, {"_id": 0, "name": 1})
        sender_org_name = sender_org["name"] if sender_org else None
    sender_name = sender_org_name or user.get("username") or f'{user.get("firstName","")} {user.get("lastName","")}'.strip()
    notif_msg = f'{sender_name} heeft je een bericht gestuurd over "{listing_title or ""}"'
    await create_notification(db, other_party_id, "new_message", notif_msg, conversation["listingId"], listing_title)

    return _serialize_message(doc)


@router.patch("/conversations/{conversation_id}/read")
async def mark_conversation_read(conversation_id: str, user: dict = Depends(get_donateur_or_validated_user)):
    _conversation, _offerer_user_id, role = await _load_conversation(conversation_id, user)
    result = await db.messages.update_many(
        {"conversationId": conversation_id, "senderId": {"$ne": user["id"]}, "readAt": None},
        {"$set": {"readAt": now_iso()}},
    )
    # E-maildigest (PRD §6.6/fase 5): lezen sluit de eigen ongelezen-periode
    # af, zodat de scheduled job geen (verouderde) bundelmail meer stuurt
    # voor berichten die intussen al gelezen zijn. Een volgend bericht start
    # gewoon een nieuwe periode (zie send_message). emailSentAt laten we
    # bewust staan — die wordt enkel vergeleken met de (nieuwe) unreadSince
    # van een volgende periode, dus stale hem alvast op None zetten voegt
    # niets toe.
    await db.conversations.update_one(
        {"id": conversation_id}, {"$set": {f"{role}UnreadSince": None}},
    )
    return {"ok": True, "modified": result.modified_count}


@router.patch("/conversations/{conversation_id}/block")
async def block_conversation(conversation_id: str, user: dict = Depends(get_donateur_or_validated_user)):
    """Blokkeert de andere partij in dit gesprek (PRD §6.4) — per gesprek,
    niet platformbreed. $addToSet is idempotent: een 2de keer blokkeren
    verandert niets. De blokkerende partij zelf blijft gewoon kunnen
    versturen (zie send_message) — enkel de geblokkeerde partij wordt
    tegengehouden."""
    _conversation, offerer_user_id, _role = await _load_conversation(conversation_id, user)
    await db.conversations.update_one({"id": conversation_id}, {"$addToSet": {"blockedBy": user["id"]}})
    updated = await db.conversations.find_one({"id": conversation_id})
    return _serialize_conversation(updated, offerer_user_id, user["id"])


@router.patch("/conversations/{conversation_id}/unblock")
async def unblock_conversation(conversation_id: str, user: dict = Depends(get_donateur_or_validated_user)):
    """Heft een eigen blokkade op. $pull raakt enkel de eigen entry in
    blockedBy — wie zelf geblokkeerd wérd (i.p.v. blokkeerde) kan zichzelf
    hierdoor dus niet deblokkeren, enkel wie de blokkade instelde."""
    _conversation, offerer_user_id, _role = await _load_conversation(conversation_id, user)
    await db.conversations.update_one({"id": conversation_id}, {"$pull": {"blockedBy": user["id"]}})
    updated = await db.conversations.find_one({"id": conversation_id})
    return _serialize_conversation(updated, offerer_user_id, user["id"])


@router.patch("/conversations/{conversation_id}/mark-handled")
async def mark_conversation_handled(conversation_id: str, user: dict = Depends(get_donateur_or_validated_user)):
    """Markeert dit gesprek als "afgehandeld" voor de aanroeper (fase 9) —
    puur organisatorisch (groepering in de gesprekslijst), géén verberg-/
    verwijderfunctie: het gesprek blijft gewoon in /conversations/mine
    staan, enkel handledByMe wijzigt. Los van hiddenBy (zie hide_conversation
    hieronder, die wél de zichtbaarheid regelt) — beide kunnen onafhankelijk
    van elkaar aan staan. Automatisch weer "in behandeling" zodra de andere
    partij een nieuw bericht stuurt, zie send_message."""
    _conversation, offerer_user_id, _role = await _load_conversation(conversation_id, user)
    await db.conversations.update_one({"id": conversation_id}, {"$addToSet": {"handledBy": user["id"]}})
    updated = await db.conversations.find_one({"id": conversation_id})
    return _serialize_conversation(updated, offerer_user_id, user["id"])


@router.patch("/conversations/{conversation_id}/unmark-handled")
async def unmark_conversation_handled(conversation_id: str, user: dict = Depends(get_donateur_or_validated_user)):
    """Zet "afgehandeld" terug naar "in behandeling" — enkel voor de eigen
    weergave, zie mark_conversation_handled hierboven."""
    _conversation, offerer_user_id, _role = await _load_conversation(conversation_id, user)
    await db.conversations.update_one({"id": conversation_id}, {"$pull": {"handledBy": user["id"]}})
    updated = await db.conversations.find_one({"id": conversation_id})
    return _serialize_conversation(updated, offerer_user_id, user["id"])


@router.delete("/conversations/{conversation_id}")
async def hide_conversation(conversation_id: str, user: dict = Depends(get_donateur_or_validated_user)):
    """Verbergt dit gesprek enkel voor de aanroeper (PRD §6.5) — geen echte
    verwijdering: de andere partij behoudt het gesprek volledig, en het
    verschijnt terug in de lijst van de aanroeper zodra er een nieuw
    bericht binnenkomt (zie send_message, dat de ontvanger telkens uit
    hiddenBy haalt).

    Fase 9: zodra BEIDE partijen het gesprek verwijderd hebben, heeft geen
    van beide de bijlagen nog nodig — die worden dan definitief van
    Cloudinary verwijderd (_purge_conversation_attachments). We triggeren
    dit enkel op de aanroep die het "beide"-punt effectief bereikt (de
    andere partij zat al in hiddenBy, ikzelf nog niet) — anders zou elke
    volgende DELETE-aanroep (idempotent, $addToSet) de opruiming nodeloos
    herhalen."""
    conversation, offerer_user_id, role = await _load_conversation(conversation_id, user)
    other_party_id = offerer_user_id if role == "requester" else conversation["requesterUserId"]
    other_already_hidden = other_party_id in conversation.get("hiddenBy", [])

    await db.conversations.update_one({"id": conversation_id}, {"$addToSet": {"hiddenBy": user["id"]}})
    if other_already_hidden:
        await _purge_conversation_attachments(conversation_id)
    return {"success": True}
