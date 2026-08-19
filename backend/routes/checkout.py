"""Magazijn-checkout (publiek)."""
import uuid

from fastapi import APIRouter, HTTPException, Request, Body

from deps import db, now_iso, limiter
from models import CheckoutCreate

router = APIRouter()


@router.post("/checkout")
@limiter.limit("10/minute")
async def create_checkout(request: Request, body: CheckoutCreate = Body(...)):
    org = await db.organisations.find_one({"id": body.organisationId})
    if not org or org["status"] not in ("validated", "active", "inactive"):
        raise HTTPException(404, "Organisatie niet gevonden")

    # De student/bestaande-gebruiker-keuze is enkel toegelaten voor
    # organisaties die daar door een admin voor gemarkeerd zijn — voorkomt
    # dat dit publieke endpoint willekeurig gemanipuleerd wordt.
    if body.checkoutBy and not org.get("studentCheckout"):
        raise HTTPException(422, "Deze organisatie ondersteunt geen student-checkout")

    picked_user = None
    if body.checkoutBy == "user":
        picked_user = await db.users.find_one(
            {"id": body.pickedUserId, "organisationId": body.organisationId, "status": "validated"},
        )
        if not picked_user:
            raise HTTPException(404, "Gebruiker niet gevonden bij deze organisatie")

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
        "checkoutBy": body.checkoutBy,
        "studentEmail": body.studentEmail,
        "pickedUserId": picked_user["id"] if picked_user else None,
    }
    await db.checkouts.insert_one(doc)

    # Een succesvolle checkout is bewijs van activiteit: reactiveer de organisatie.
    if org["status"] == "inactive":
        await db.organisations.update_one(
            {"id": body.organisationId},
            {"$set": {"status": "active", "updatedAt": now}},
        )

    return {"ok": True, "totalWeightKg": total}
