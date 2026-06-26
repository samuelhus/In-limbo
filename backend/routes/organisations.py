"""Organisations: public list/search/get + member/admin update + jaarverslag PDF."""
from __future__ import annotations
import io
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfgen import canvas as rl_canvas

from deps import db, now_iso, strip_mongo
from models import OrgUpdate
from auth import get_validated_user

router = APIRouter()


TRANSLATIONS = {
    "nl": {
        "title": "Jaarverslag",
        "org": "Organisatie",
        "period": "Periode",
        "summary": "Overzicht",
        "platform_given": "Herbestemd via platform",
        "platform_received": "Ontvangen via platform",
        "magazijn_donated": "Gedoneerd aan magazijn",
        "magazijn_received": "Ontvangen uit magazijn",
        "checkin_detail": "Detail checkin sessies",
        "platform_given_detail": "Detail herbestemmingen via platform",
        "platform_received_detail": "Detail ontvangsten via platform",
        "listing_title": "Aanbieding",
        "date": "Datum",
        "material": "Materiaal",
        "weight": "Gewicht (kg)",
        "description": "Beschrijving",
        "total": "Totaal",
        "items": "items",
        "generated": "Gegenereerd op",
        "no_description": "—",
        "page": "Pagina",
    },
    "fr": {
        "title": "Rapport annuel",
        "org": "Organisation",
        "period": "Période",
        "summary": "Aperçu",
        "platform_given": "Redistribué via la plateforme",
        "platform_received": "Reçu via la plateforme",
        "magazijn_donated": "Donné au magasin",
        "magazijn_received": "Reçu du magasin",
        "checkin_detail": "Détail des sessions d'entrée",
        "platform_given_detail": "Détail des redistributions via la plateforme",
        "platform_received_detail": "Détail des réceptions via la plateforme",
        "listing_title": "Offre",
        "date": "Date",
        "material": "Matériau",
        "weight": "Poids (kg)",
        "description": "Description",
        "total": "Total",
        "items": "articles",
        "generated": "Généré le",
        "no_description": "—",
        "page": "Page",
    },
}

MINT = HexColor("#34D399")
BLACK = HexColor("#000000")
LIGHT = HexColor("#F4F4F5")
MUTED = HexColor("#6B7280")


@router.get("/organisations")
async def list_organisations(
    q: str = Query("", description="Search query for org name"),
    validated_only: bool = Query(True),
):
    """Public list. If validated_only, only orgs that passed validation —
    this includes 'inactive' (dormant >24mo, see tasks.mark_inactive_orgs):
    an org doesn't stop being a validated partner just because it's been
    quiet, so the partner page still lists it.
    """
    filt: dict = {}
    if validated_only:
        filt["status"] = {"$in": ["validated", "active", "inactive"]}
        # Hide orgs that explicitly opted out; treat missing field as visible (backwards-compat).
        filt["visibleOnPartnerPage"] = {"$ne": False}
    if q:
        if len(q) < 2:
            return []
        filt["name"] = {"$regex": q, "$options": "i"}

    cursor = db.organisations.find(filt).sort("name", 1).limit(50)
    out = []
    async for o in cursor:
        out.append(strip_mongo(o))
    return out


@router.get("/organisations/search")
async def search_organisations(q: str = Query(..., min_length=2), includeInactive: bool = False):
    statuses = ["validated", "active", "inactive"] if includeInactive else ["validated", "active"]
    regex = {"$regex": q, "$options": "i"}
    docs = await db.organisations.find(
        {"name": regex, "status": {"$in": statuses}},
        {"_id": 0, "id": 1, "name": 1, "category": 1},
    ).limit(10).to_list(10)
    return docs


@router.get("/organisations/{org_id}")
async def get_organisation(org_id: str):
    org = await db.organisations.find_one({"id": org_id})
    if not org:
        raise HTTPException(404, "Organisatie niet gevonden")
    if org["status"] not in ("validated", "active", "inactive"):
        raise HTTPException(404, "Organisatie niet beschikbaar")
    return strip_mongo(org)


@router.patch("/organisations/{org_id}")
async def update_organisation(
    org_id: str, body: OrgUpdate, user: dict = Depends(get_validated_user),
):
    if user["organisationId"] != org_id and user["role"] != "admin":
        raise HTTPException(403, "Niet toegestaan")
    # `exclude_unset` keeps fields the client didn't send out of the update.
    # We then drop only None values so an explicit `False` (e.g. visibleOnPartnerPage)
    # still gets persisted.
    raw = body.model_dump(exclude_unset=True)
    update = {k: v for k, v in raw.items() if v is not None}
    if not update:
        return await get_organisation(org_id)
    update["updatedAt"] = now_iso()
    await db.organisations.update_one({"id": org_id}, {"$set": update})
    return await get_organisation(org_id)



# --------------------------------------------------------------------------
# JAARVERSLAG PDF
# --------------------------------------------------------------------------
A4_W, A4_H = A4
MARGIN_X = 18 * mm
FOOTER_Y = 14 * mm


def _draw_footer(c: rl_canvas.Canvas, page_num: int, total_pages: int, t: dict, year: int) -> None:
    """Footer + dunne lijn boven."""
    c.setStrokeColor(MINT)
    c.setLineWidth(0.4)
    c.line(MARGIN_X, FOOTER_Y + 5, A4_W - MARGIN_X, FOOTER_Y + 5)
    c.setFont("Helvetica", 7)
    c.setFillColor(MUTED)
    c.drawString(MARGIN_X, FOOTER_Y, "In Limbo · Brussel · info@inlimbo.be")
    today = datetime.now().strftime("%d/%m/%Y")
    middle = f"{t['generated']} {today} · {t['title']} {year}"
    c.drawCentredString(A4_W / 2, FOOTER_Y, middle)
    c.drawRightString(A4_W - MARGIN_X, FOOTER_Y, f"{t['page']} {page_num} / {total_pages}")
    c.setFillColor(BLACK)


def _draw_header(c: rl_canvas.Canvas, t: dict, year: int, org_name: str) -> float:
    """Returns y-cursor after header."""
    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(MARGIN_X, A4_H - 25 * mm, "In Limbo")
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED)
    c.drawString(MARGIN_X, A4_H - 30 * mm, "Circulaire materialen · Brussel")

    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 28)
    title_y = A4_H - 50 * mm
    c.drawString(MARGIN_X, title_y, org_name[:60])

    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    c.drawString(MARGIN_X, title_y - 6 * mm, f"{t['title'].upper()} · {year}")

    c.setStrokeColor(MINT)
    c.setLineWidth(1)
    line_y = title_y - 12 * mm
    c.line(MARGIN_X, line_y, A4_W - MARGIN_X, line_y)
    c.setFillColor(BLACK)
    return line_y - 8 * mm


def _draw_summary_grid(c: rl_canvas.Canvas, y: float, t: dict, stats: dict) -> float:
    """2x2 metrics grid. Returns new y-cursor."""
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(MINT)
    c.drawString(MARGIN_X, y, t["summary"].upper())
    c.setFillColor(BLACK)
    y -= 8 * mm

    cell_w = (A4_W - 2 * MARGIN_X) / 2
    cell_h = 28 * mm

    cells = [
        (t["platform_given"], f"{stats['platform_given_kg']:.1f} kg", f"{stats['platform_given_count']} {t['items']}"),
        (t["platform_received"], f"{stats['platform_received_kg']:.1f} kg", f"{stats['platform_received_count']} {t['items']}"),
        (t["magazijn_donated"], f"{stats['checkin_kg']:.1f} kg", f"{stats['checkin_count']} {t['items']}"),
        (t["magazijn_received"], f"{stats['checkout_kg']:.1f} kg", f"{stats['checkout_count']} {t['items']}"),
    ]

    for i, (label, big, small) in enumerate(cells):
        col = i % 2
        row = i // 2
        x = MARGIN_X + col * cell_w
        cy = y - (row + 1) * cell_h
        c.setStrokeColor(BLACK)
        c.setLineWidth(0.4)
        c.rect(x, cy, cell_w, cell_h, stroke=1, fill=0)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 8)
        c.drawString(x + 5 * mm, cy + cell_h - 7 * mm, label.upper())
        c.setFillColor(BLACK)
        c.setFont("Helvetica-Bold", 20)
        c.drawString(x + 5 * mm, cy + cell_h - 17 * mm, big)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 9)
        c.drawString(x + 5 * mm, cy + 5 * mm, small)
        c.setFillColor(BLACK)

    return y - 2 * cell_h - 8 * mm


def _draw_checkin_detail(
    c: rl_canvas.Canvas, y: float, t: dict, year: int, org_name: str,
    page_num: int, checkins: list, total_pages_holder: list,
) -> tuple[int, float]:
    """Renders checkin detail table with auto-pagination. Returns (page_num, y_cursor)."""
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(MINT)
    c.drawString(MARGIN_X, y, t["checkin_detail"].upper())
    c.setFillColor(BLACK)
    y -= 7 * mm

    # Column header
    col_x = [MARGIN_X, MARGIN_X + 30 * mm, MARGIN_X + 75 * mm, MARGIN_X + 110 * mm]
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(MUTED)
    c.drawString(col_x[0], y, t["date"].upper())
    c.drawString(col_x[1], y, t["material"].upper())
    c.drawString(col_x[2], y, t["weight"].upper())
    c.drawString(col_x[3], y, t["description"].upper())
    c.setFillColor(BLACK)
    y -= 2 * mm
    c.setStrokeColor(BLACK)
    c.setLineWidth(0.4)
    c.line(MARGIN_X, y, A4_W - MARGIN_X, y)
    y -= 5 * mm

    row_idx = 0
    min_y = FOOTER_Y + 12 * mm
    desc_max_chars = 45

    for ck in checkins:
        ck_date = (ck.get("createdAt") or "")[:10]
        for item in ck.get("items", []):
            if y < min_y:
                _draw_footer(c, page_num, total_pages_holder[0], t, year)
                c.showPage()
                page_num += 1
                # mini-header on follow-up pages
                c.setFont("Helvetica-Bold", 11)
                c.setFillColor(MINT)
                c.drawString(MARGIN_X, A4_H - 20 * mm, f"{t['checkin_detail'].upper()} · {org_name}")
                c.setFillColor(BLACK)
                y = A4_H - 28 * mm
                c.setFont("Helvetica-Bold", 8)
                c.setFillColor(MUTED)
                c.drawString(col_x[0], y, t["date"].upper())
                c.drawString(col_x[1], y, t["material"].upper())
                c.drawString(col_x[2], y, t["weight"].upper())
                c.drawString(col_x[3], y, t["description"].upper())
                c.setFillColor(BLACK)
                y -= 2 * mm
                c.line(MARGIN_X, y, A4_W - MARGIN_X, y)
                y -= 5 * mm
                row_idx = 0

            if row_idx % 2 == 1:
                c.setFillColor(LIGHT)
                c.rect(MARGIN_X - 1 * mm, y - 2 * mm, A4_W - 2 * MARGIN_X + 2 * mm, 6 * mm, stroke=0, fill=1)
                c.setFillColor(BLACK)

            c.setFont("Helvetica", 9)
            c.drawString(col_x[0], y, ck_date)
            c.drawString(col_x[1], y, str(item.get("material", ""))[:25])
            c.drawString(col_x[2], y, f"{float(item.get('weightKg', 0)):.2f}")
            desc = item.get("description") or t["no_description"]
            if len(desc) > desc_max_chars:
                desc = desc[: desc_max_chars - 1] + "…"
            c.drawString(col_x[3], y, desc)
            y -= 6 * mm
            row_idx += 1

    return page_num, y


def _draw_transfer_detail(
    c: rl_canvas.Canvas, y: float, t: dict, year: int, org_name: str,
    page_num: int, transfers: list, total_pages_holder: list, title_key: str,
) -> tuple[int, float]:
    """Renders a 3-column platform-transfer detail table (date / listing title / weight).
    Auto-paginates. Returns (page_num, y_cursor)."""
    if not transfers:
        return page_num, y

    min_y = FOOTER_Y + 12 * mm
    title_max_chars = 55

    def draw_header(yy: float) -> float:
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(MINT)
        c.drawString(MARGIN_X, yy, t[title_key].upper())
        c.setFillColor(BLACK)
        yy -= 7 * mm
        col_x = [MARGIN_X, MARGIN_X + 28 * mm, MARGIN_X + 68 * mm, MARGIN_X + 95 * mm]
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(MUTED)
        c.drawString(col_x[0], yy, t["date"].upper())
        c.drawString(col_x[1], yy, t["material"].upper())
        c.drawString(col_x[2], yy, t["weight"].upper())
        c.drawString(col_x[3], yy, t["listing_title"].upper())
        c.setFillColor(BLACK)
        yy -= 2 * mm
        c.setStrokeColor(BLACK)
        c.setLineWidth(0.4)
        c.line(MARGIN_X, yy, A4_W - MARGIN_X, yy)
        return yy - 5 * mm, col_x

    # Section needs at least 30mm to start; otherwise new page
    if y < min_y + 30 * mm:
        _draw_footer(c, page_num, total_pages_holder[0], t, year)
        c.showPage()
        page_num += 1
        y = A4_H - 20 * mm

    y, col_x = draw_header(y)
    row_idx = 0

    transfers_sorted = sorted(transfers, key=lambda x: x.get("createdAt") or "")
    for tr in transfers_sorted:
        if y < min_y:
            _draw_footer(c, page_num, total_pages_holder[0], t, year)
            c.showPage()
            page_num += 1
            c.setFont("Helvetica-Bold", 11)
            c.setFillColor(MINT)
            c.drawString(MARGIN_X, A4_H - 20 * mm, f"{t[title_key].upper()} · {org_name}")
            c.setFillColor(BLACK)
            y = A4_H - 28 * mm
            y, col_x = draw_header(y)
            row_idx = 0

        if row_idx % 2 == 1:
            c.setFillColor(LIGHT)
            c.rect(MARGIN_X - 1 * mm, y - 2 * mm, A4_W - 2 * MARGIN_X + 2 * mm, 6 * mm, stroke=0, fill=1)
            c.setFillColor(BLACK)

        c.setFont("Helvetica", 9)
        c.drawString(col_x[0], y, (tr.get("createdAt") or "")[:10])
        c.drawString(col_x[1], y, (tr.get("material") or "—")[:18])
        c.drawString(col_x[2], y, f"{float(tr.get('weightKg', 0)):.2f}")
        title = tr.get("listingTitle") or "—"
        if len(title) > 40:
            title = title[:39] + "…"
        c.drawString(col_x[3], y, title)
        y -= 6 * mm
        row_idx += 1

    return page_num, y - 4 * mm


@router.get("/organisations/me/stats/available-years")
async def org_available_years(user: dict = Depends(get_validated_user)):
    """Years for which the current user's organisation has any activity."""
    if not user.get("organisationId"):
        return {"years": []}
    org_id = user["organisationId"]
    years: set[str] = set()
    cursors = [
        db.platform_transfers.find(
            {"$or": [
                {"senderOrganisationId": org_id},
                {"offererOrganisationId": org_id},
                {"receiverOrganisationId": org_id},
            ]},
            {"createdAt": 1},
        ),
        db.checkins.find({"organisationId": org_id}, {"createdAt": 1}),
        db.checkouts.find({"organisationId": org_id}, {"createdAt": 1}),
    ]
    for cur in cursors:
        async for doc in cur:
            if doc.get("createdAt"):
                years.add(doc["createdAt"][:4])
    return {"years": sorted(years, reverse=True)}


@router.get("/organisations/me/stats/report")
async def download_org_stats_report(
    year: int = Query(...),
    lang: str = Query("nl"),
    user: dict = Depends(get_validated_user),
):
    if not user.get("organisationId"):
        raise HTTPException(400, "Geen organisatie gekoppeld aan dit account")

    org_id = user["organisationId"]
    org = await db.organisations.find_one({"id": org_id})
    if not org:
        raise HTTPException(404, "Organisatie niet gevonden")

    t = TRANSLATIONS.get(lang, TRANSLATIONS["nl"])
    date_prefix = str(year)
    date_filter = {"$gte": f"{date_prefix}-01-01", "$lt": f"{int(year) + 1}-01-01"}

    # Platform transfers — received & given (handles both new senderOrganisationId and legacy offererOrganisationId)
    platform_given = await db.platform_transfers.find(
        {
            "$or": [
                {"senderOrganisationId": org_id},
                {"offererOrganisationId": org_id},
            ],
            "createdAt": date_filter,
        },
    ).to_list(2000)
    platform_received = await db.platform_transfers.find(
        {"receiverOrganisationId": org_id, "createdAt": date_filter},
    ).to_list(2000)

    # Checkins (gedoneerd) + Checkouts (ontvangen uit magazijn)
    checkins = await db.checkins.find(
        {"organisationId": org_id, "createdAt": date_filter},
    ).sort("createdAt", 1).to_list(2000)
    checkouts = await db.checkouts.find(
        {"organisationId": org_id, "createdAt": date_filter},
    ).to_list(2000)

    # Enrich legacy transfers without listingTitle via lookup
    missing_ids = list({
        tr["listingId"] for tr in (platform_given + platform_received)
        if not tr.get("listingTitle") and tr.get("listingId")
    })
    if missing_ids:
        title_map: dict[str, str] = {}
        async for ldoc in db.listings.find(
            {"id": {"$in": missing_ids}}, {"_id": 0, "id": 1, "title": 1},
        ):
            title_map[ldoc["id"]] = ldoc.get("title", "")
        for tr in platform_given + platform_received:
            if not tr.get("listingTitle"):
                tr["listingTitle"] = title_map.get(tr.get("listingId"), "")

    stats = {
        "platform_given_kg": round(sum(p.get("weightKg", 0) for p in platform_given), 2),
        "platform_given_count": len(platform_given),
        "platform_received_kg": round(sum(p.get("weightKg", 0) for p in platform_received), 2),
        "platform_received_count": len(platform_received),
        "checkin_kg": round(sum(c.get("totalWeightKg", 0) for c in checkins), 2),
        "checkin_count": len(checkins),
        "checkout_kg": round(sum(c.get("totalWeightKg", 0) for c in checkouts), 2),
        "checkout_count": len(checkouts),
    }

    # ----- PDF generation -----
    # Build content first, count pages, then re-render to get correct "x / Y"
    def build(target_pages: int) -> bytes:
        buf = io.BytesIO()
        c = rl_canvas.Canvas(buf, pagesize=A4)
        page_num = 1
        y = _draw_header(c, t, year, org["name"])
        y = _draw_summary_grid(c, y, t, stats)
        total_holder = [target_pages]
        if checkins:
            page_num, y = _draw_checkin_detail(c, y, t, year, org["name"],
                                               page_num, checkins, total_holder)
        if platform_given:
            page_num, y = _draw_transfer_detail(
                c, y, t, year, org["name"], page_num, platform_given,
                total_holder, "platform_given_detail",
            )
        if platform_received:
            page_num, y = _draw_transfer_detail(
                c, y, t, year, org["name"], page_num, platform_received,
                total_holder, "platform_received_detail",
            )
        _draw_footer(c, page_num, target_pages, t, year)
        c.showPage()
        c.save()
        return buf.getvalue(), page_num

    # First pass: count pages
    _, pages = build(1)
    # Second pass: render with correct total pages
    pdf_bytes, _ = build(pages)

    filename = f"inlimbo-verslag-{org_id}-{year}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
