"""Kiosk-mededelingen (zie prd/PRD_kiosk_modus.md §6.6/§8). Los van het
bestaande Meldingen-systeem (admin-alerts, zie CLAUDE.md-sectie "Notificaties
vs. Meldingen vs. Berichten") — een kiosk-mededeling gaat de andere richting
op: een admin stuurt een boodschap náár de kioskbezoekers (banner op /kiosk),
geen signaal náár de admin.
"""
from __future__ import annotations
import uuid

from fastapi import APIRouter, HTTPException, Depends

from deps import db, now_iso
from models import KioskMessageCreate, KioskMessageUpdate
from auth import get_admin_user

router = APIRouter()


def _serialize(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "type": doc["type"],
        "text": doc["text"],
        "active": doc["active"],
        "createdAt": doc["createdAt"],
        "updatedAt": doc.get("updatedAt", doc["createdAt"]),
    }


@router.get("/kiosk/messages")
async def list_active_kiosk_messages():
    """Publiek/onbeveiligd (PRD §11, zelfde toegangsniveau als GET /news) —
    enkel actieve berichten, voor de banner op /kiosk. Geen rate-limit nodig
    (PRD §8): dit is een goedkope, kleine-collectie leesquery, geen typeahead."""
    docs = await db.kiosk_messages.find({"active": True}).sort("createdAt", -1).to_list(100)
    return [_serialize(d) for d in docs]


@router.get("/admin/kiosk/messages")
async def list_all_kiosk_messages(admin: dict = Depends(get_admin_user)):
    """Alle berichten (actief + inactief), voor het admin-beheertabblad."""
    docs = await db.kiosk_messages.find({}).sort("createdAt", -1).to_list(500)
    return [_serialize(d) for d in docs]


@router.post("/admin/kiosk/messages")
async def create_kiosk_message(body: KioskMessageCreate, admin: dict = Depends(get_admin_user)):
    now = now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "type": body.type,
        "text": body.text,
        "active": body.active,
        "createdAt": now,
        "updatedAt": now,
    }
    await db.kiosk_messages.insert_one(doc)
    return _serialize(doc)


@router.patch("/admin/kiosk/messages/{message_id}")
async def update_kiosk_message(message_id: str, body: KioskMessageUpdate, admin: dict = Depends(get_admin_user)):
    doc = await db.kiosk_messages.find_one({"id": message_id})
    if not doc:
        raise HTTPException(404, "Bericht niet gevonden")
    update: dict = {"updatedAt": now_iso()}
    for f in ("type", "text", "active"):
        val = getattr(body, f)
        if val is not None:
            update[f] = val
    await db.kiosk_messages.update_one({"id": message_id}, {"$set": update})
    updated = await db.kiosk_messages.find_one({"id": message_id})
    return _serialize(updated)


@router.delete("/admin/kiosk/messages/{message_id}")
async def delete_kiosk_message(message_id: str, admin: dict = Depends(get_admin_user)):
    res = await db.kiosk_messages.delete_one({"id": message_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Bericht niet gevonden")
    return {"ok": True}
