"""Jaarverslag voor donateur-accounts.

Donateurs hebben geen organisationId en dus geen magazijn-checkouts (dat
vereist een organisatie — checkouts zijn materiaal dat een organisatie uit
het magazijn meeneemt, geen rol die een donateur speelt). Ze geven materiaal
weg op twee manieren: rechtstreeks via aanbiedingen (listings) op het
platform, of — enkel bedrijfs-donateurs (donorType == 'bedrijf') — door het
zelf naar het magazijn te brengen via een checkin (zie routes/checkin.py,
CheckinCreate.donateurUserId). Dit jaarverslag combineert dus 'via platform
herbestemd' met eventuele checkins; er is bewust geen checkout-sectie, in
tegenstelling tot het organisatie-jaarverslag.

De PDF-opbouw hergebruikt dezelfde tekenfuncties (_draw_header, _draw_summary_grid,
...) als het organisatie-jaarverslag in organisations.py, om visueel consistent
te blijven en geen code te dupliceren.
"""
from __future__ import annotations
import io

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as rl_canvas

from deps import db
from auth import get_current_user
import impact as impact_calc

# Hergebruik van de bestaande PDF-tekenfuncties en vertalingen — zelfde visuele
# stijl als het organisatie-jaarverslag, geen duplicatie van tekencode.
from routes.organisations import (
    TRANSLATIONS,
    _draw_header,
    _draw_summary_grid,
    _draw_co2_highlight,
    _draw_checkin_detail,
    _draw_transfer_detail,
    _draw_footer,
)

router = APIRouter()


def _report_name(user: dict) -> str:
    """Naam die op het jaarverslag komt te staan: bedrijfsnaam bij een
    bedrijfs-donateur, anders de (publieke) gebruikersnaam."""
    if user.get("donorType") == "bedrijf" and user.get("companyName"):
        return user["companyName"]
    return user.get("username") or "Donateur"


async def _own_listing_ids(user_id: str) -> list[str]:
    ids = []
    async for doc in db.listings.find({"userId": user_id}, {"_id": 0, "id": 1}):
        ids.append(doc["id"])
    return ids


@router.get("/donateur/me/stats/available-years")
async def donateur_available_years(user: dict = Depends(get_current_user)):
    """Jaren waarin deze donateur minstens 1 herbestemming via het platform
    had, en/of (voor bedrijfs-donateurs) minstens 1 magazijn-checkin."""
    if user.get("role") != "donateur":
        raise HTTPException(403, "Enkel voor donateur-accounts")
    years: set[str] = set()
    listing_ids = await _own_listing_ids(user["id"])
    if listing_ids:
        async for doc in db.platform_transfers.find(
            {"listingId": {"$in": listing_ids}}, {"createdAt": 1},
        ):
            if doc.get("createdAt"):
                years.add(doc["createdAt"][:4])
    async for doc in db.checkins.find({"donateurUserId": user["id"]}, {"createdAt": 1}):
        if doc.get("createdAt"):
            years.add(doc["createdAt"][:4])
    return {"years": sorted(years, reverse=True)}


@router.get("/donateur/me/stats/report")
async def download_donateur_report(
    year: int = Query(...),
    lang: str = Query("nl"),
    user: dict = Depends(get_current_user),
):
    if user.get("role") != "donateur":
        raise HTTPException(403, "Enkel voor donateur-accounts")

    t = TRANSLATIONS.get(lang, TRANSLATIONS["nl"])
    report_name = _report_name(user)

    listing_ids = await _own_listing_ids(user["id"])
    date_filter = {"$gte": f"{year}-01-01", "$lt": f"{int(year) + 1}-01-01"}

    platform_given = []
    if listing_ids:
        platform_given = await db.platform_transfers.find(
            {"listingId": {"$in": listing_ids}, "createdAt": date_filter},
        ).to_list(2000)

    # Enkel bedrijfs-donateurs kunnen een checkin op hun naam hebben (zie
    # CheckinCreate.donateurUserId) — voor particuliere donateurs blijft dit
    # gewoon leeg.
    checkins = await db.checkins.find(
        {"donateurUserId": user["id"], "createdAt": date_filter},
    ).sort("createdAt", 1).to_list(2000)

    # Enrich legacy transfers zonder listingTitle (zelfde patroon als het
    # organisatie-jaarverslag).
    missing_ids = list({
        tr["listingId"] for tr in platform_given
        if not tr.get("listingTitle") and tr.get("listingId")
    })
    if missing_ids:
        title_map: dict[str, str] = {}
        async for ldoc in db.listings.find(
            {"id": {"$in": missing_ids}}, {"_id": 0, "id": 1, "title": 1},
        ):
            title_map[ldoc["id"]] = ldoc.get("title", "")
        for tr in platform_given:
            if not tr.get("listingTitle"):
                tr["listingTitle"] = title_map.get(tr.get("listingId"), "")

    stats = {
        "platform_given_kg": round(sum(p.get("weightKg", 0) for p in platform_given), 2),
        "platform_given_count": len(platform_given),
        "platform_received_kg": 0,
        "platform_received_count": 0,
        "checkin_kg": round(sum(c.get("totalWeightKg", 0) for c in checkins), 2),
        "checkin_count": len(checkins),
        "checkout_kg": 0,
        "checkout_count": 0,
    }
    impact_combined = impact_calc.combine(
        impact_calc.summarize_flat(platform_given),
        impact_calc.summarize_nested(checkins),
    )
    stats["co2_kg"] = impact_combined["totalCo2Kg"]

    def build(target_pages: int) -> bytes:
        buf = io.BytesIO()
        c = rl_canvas.Canvas(buf, pagesize=A4)
        page_num = 1
        y = _draw_header(c, t, year, report_name)
        y = _draw_summary_grid(c, y, t, stats)
        y = _draw_co2_highlight(c, y, t, stats["co2_kg"])
        total_holder = [target_pages]
        if checkins:
            page_num, y = _draw_checkin_detail(c, y, t, year, report_name,
                                               page_num, checkins, total_holder)
        if platform_given:
            page_num, y = _draw_transfer_detail(
                c, y, t, year, report_name, page_num, platform_given,
                total_holder, "platform_given_detail",
            )
        _draw_footer(c, page_num, target_pages, t, year)
        c.showPage()
        c.save()
        return buf.getvalue(), page_num

    _, pages = build(1)
    pdf_bytes, _ = build(pages)

    filename = f"inlimbo-verslag-{user['id']}-{year}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
