"""Magazijn-checkin (alleen admins)."""
from __future__ import annotations
import uuid

from fastapi import APIRouter, HTTPException, Depends

from deps import db, now_iso
from auth import get_admin_user
from models import CheckinCreate

router = APIRouter()


@router.post("/checkin")
async def create_checkin(body: CheckinCreate, admin: dict = Depends(get_admin_user)):
    org = await db.organisations.find_one({"id": body.organisationId})
    if not org or org["status"] not in ("validated", "active"):
        raise HTTPException(404, "Organisatie niet gevonden")
    now = now_iso()
    total = round(sum(item.weightKg for item in body.items), 3)
    doc = {
        "id": str(uuid.uuid4()),
        "organisationId": body.organisationId,
        "organisationName": org["name"],
        "items": [
            {
                "material": i.material,
                "weightKg": round(i.weightKg, 3),
                "description": i.description,
            }
            for i in body.items
        ],
        "totalWeightKg": total,
        "type": "magazijn_checkin",
        "createdAt": now,
    }
    await db.checkins.insert_one(doc)
    return {"ok": True, "totalWeightKg": total}
