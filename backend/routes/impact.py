"""Impact-endpoints. Rekenlogica zelf staat in impact.py (root van de backend),
niet hier — deze route-file bevat enkel de data-ophaling + wiring."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from deps import db
from auth import get_validated_user
import impact as impact_calc

router = APIRouter()


@router.get("/impact/platform")
async def platform_impact():
    """Platform-brede impact-cijfers (publiek, geen login nodig).

    Telt: platform_transfers (rechtstreekse listing-overdrachten) +
    checkouts (materiaal opgehaald uit het magazijn) — dit is het moment
    waarop materiaal daadwerkelijk een nieuwe gebruiker bereikt.
    checkins (binnengebracht, nog niet per se hergebruikt) telt hier bewust
    NIET mee, om de impact niet te overschatten met materiaal dat nog in het
    magazijn ligt te wachten.
    """
    transfers = await db.platform_transfers.find({}, {"_id": 0, "material": 1, "weightKg": 1}).to_list(100_000)
    checkouts = await db.checkouts.find({}, {"_id": 0, "items": 1}).to_list(100_000)

    transfers_summary = impact_calc.summarize_flat(transfers)
    checkouts_summary = impact_calc.summarize_nested(checkouts)
    combined = impact_calc.combine(transfers_summary, checkouts_summary)

    return {
        **combined,
        "methodology": "/impact-methodologie",
    }


@router.get("/organisations/me/stats/impact")
async def organisation_impact(
    year: int = Query(..., description="Kalenderjaar, bv. 2026"),
    user: dict = Depends(get_validated_user),
):
    """Impact-cijfers voor de organisatie van de ingelogde gebruiker, over één
    kalenderjaar. Telt platform_transfers (gegeven + ontvangen) + checkins +
    checkouts — bedoeld voor gebruik in het jaarverslag (jaarverslag-PDF volgt
    later; dit endpoint levert alvast de cijfers).
    """
    if not user.get("organisationId"):
        return {"totalWeightKg": 0, "totalCo2Kg": 0, "byCategory": {}}

    org_id = user["organisationId"]
    date_filter = {"$gte": f"{year}-01-01", "$lt": f"{year + 1}-01-01"}

    transfers = await db.platform_transfers.find(
        {
            "$or": [
                {"senderOrganisationId": org_id},
                {"offererOrganisationId": org_id},
                {"receiverOrganisationId": org_id},
            ],
            "createdAt": date_filter,
        },
        {"_id": 0, "material": 1, "weightKg": 1},
    ).to_list(10_000)

    checkins = await db.checkins.find(
        {"organisationId": org_id, "createdAt": date_filter}, {"_id": 0, "items": 1},
    ).to_list(10_000)
    checkouts = await db.checkouts.find(
        {"organisationId": org_id, "createdAt": date_filter}, {"_id": 0, "items": 1},
    ).to_list(10_000)

    combined = impact_calc.combine(
        impact_calc.summarize_flat(transfers),
        impact_calc.summarize_nested(checkins),
        impact_calc.summarize_nested(checkouts),
    )
    return {**combined, "year": year, "methodology": "/impact-methodologie"}
