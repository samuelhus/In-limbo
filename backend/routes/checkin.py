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
    now = now_iso()
    total = round(sum(item.weightKg for item in body.items), 2)
    doc = {
        "id": str(uuid.uuid4()),
        "items": [
            {
                "material": i.material,
                "weightKg": round(i.weightKg, 2),
                "description": i.description,
            }
            for i in body.items
        ],
        "totalWeightKg": total,
        "type": "magazijn_checkin",
        "createdAt": now,
    }

    if body.organisationId:
        org = await db.organisations.find_one({"id": body.organisationId})
        if not org or org["status"] not in ("validated", "active"):
            raise HTTPException(404, "Organisatie niet gevonden")
        doc["organisationId"] = body.organisationId
        doc["organisationName"] = org["name"]
    else:
        donateur = await db.users.find_one({
            "id": body.donateurUserId, "role": "donateur", "donorType": "bedrijf",
        })
        if not donateur or donateur.get("status") != "validated":
            raise HTTPException(404, "Donateur niet gevonden")
        doc["donateurUserId"] = body.donateurUserId
        doc["donateurCompanyName"] = donateur.get("companyName")

    await db.checkins.insert_one(doc)
    return {"ok": True, "totalWeightKg": total}
