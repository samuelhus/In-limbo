"""Magazijn-checkout (publiek)."""
from __future__ import annotations
import uuid

from fastapi import APIRouter, HTTPException

from deps import db, now_iso
from models import CheckoutCreate

router = APIRouter()


@router.post("/checkout")
async def create_checkout(body: CheckoutCreate):
    org = await db.organisations.find_one({"id": body.organisationId})
    if not org or org["status"] not in ("validated", "active"):
        raise HTTPException(404, "Organisatie niet gevonden")
    now = now_iso()
    total = round(sum(item.weightKg for item in body.items), 3)
    doc = {
        "id": str(uuid.uuid4()),
        "organisationId": body.organisationId,
        "organisationName": org["name"],
        "items": [{"material": i.material, "weightKg": round(i.weightKg, 3)} for i in body.items],
        "totalWeightKg": total,
        "type": "magazijn",
        "createdAt": now,
    }
    await db.checkouts.insert_one(doc)
    return {"ok": True, "totalWeightKg": total}
