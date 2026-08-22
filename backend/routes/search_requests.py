"""Zoekertjes (search_requests): gebruikers geven aan welk materiaal ze voor
een project nodig hebben, zodat het admin-team kan filteren op wie waarnaar
op zoek is en hen manueel kan contacteren buiten het platform (zie PRD §1).

Zichtbaarheid is nadrukkelijk NIET publiek: enkel gevalideerde gebruikers
(binnen hun eigen organisatie) en admins (overal) kunnen zoekertjes zien.
Donateurs hebben geen toegang — ze horen niet bij een organisatie.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends, Query

from deps import db, now_iso, strip_mongo, generate_unique_search_request_slug
from auth import get_validated_user, get_admin_user
from models import (
    SearchRequestCreateBody, SearchRequestAdminCreateBody, SearchRequestUpdate,
    MATERIAL_CATEGORIES, MATERIAL_SUBCATEGORY_MAP, MATERIAL_MAIN_CATEGORY_KEYS,
)
from reports import create_report

router = APIRouter()

MIN_DEADLINE_DAYS = 1        # minimum = morgen (voor zowel gebruiker als admin)
MAX_DEADLINE_MONTHS_USER = 12       # maximum voor gebruikers = 12 maanden vanaf vandaag
DEFAULT_DEADLINE_MONTHS_ADMIN = 12  # admin: auto-invullen indien leeg


def _today() -> datetime:
    return datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def _add_months(d: datetime, months: int) -> datetime:
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                       31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return d.replace(year=year, month=month, day=day)


def _require_not_donateur(user: dict) -> None:
    if user.get("role") == "donateur":
        raise HTTPException(403, "Donateurs hebben geen toegang tot zoekertjes")


def _validate_and_clamp_deadline(deadline: str | None, is_admin: bool) -> str:
    """Deadline is verplicht voor gebruikers (geen auto-default meer). Admin mag
    het veld leeg laten (dan 12 maanden default) en mag, in tegenstelling tot
    gebruikers, ook verder dan 12 maanden vooruit plannen (geen bovengrens)."""
    today = _today()
    if not deadline:
        if not is_admin:
            raise HTTPException(400, "Deadline is verplicht")
        return _add_months(today, DEFAULT_DEADLINE_MONTHS_ADMIN).date().isoformat()
    try:
        parsed = datetime.fromisoformat(deadline).replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(400, "Ongeldige deadline-datum")
    min_date = today + timedelta(days=MIN_DEADLINE_DAYS)
    if parsed < min_date:
        raise HTTPException(400, "Deadline moet minstens morgen zijn")
    if not is_admin:
        max_date = _add_months(today, MAX_DEADLINE_MONTHS_USER)
        if parsed > max_date:
            raise HTTPException(400, f"Deadline mag maximaal {MAX_DEADLINE_MONTHS_USER} maanden vooruit liggen")
    return parsed.date().isoformat()


def _compute_status(doc: dict) -> str:
    if doc.get("closed"):
        return "verlopen"
    deadline = doc.get("deadline")
    if not deadline:
        return "actief"
    try:
        d = datetime.fromisoformat(deadline).replace(tzinfo=timezone.utc)
    except ValueError:
        return "actief"
    return "actief" if d.date() >= _today().date() else "verlopen"


def _public_view(doc: dict) -> dict:
    v = strip_mongo(dict(doc))
    v["status"] = _compute_status(v)
    return v


# ---------- Materiaal-categorieën (voor de wizard/matching-tool UI) ----------
@router.get("/material-categories")
async def list_material_categories():
    return MATERIAL_CATEGORIES


# ---------- Gebruikerskant ----------
@router.get("/search-requests/mine")
async def list_my_search_requests(user: dict = Depends(get_validated_user)):
    """Alle actieve zoekertjes van de eigen organisatie (niet enkel de eigen,
    want elk orglid mag alle zoekertjes van de organisatie bewerken — §2/§7)."""
    _require_not_donateur(user)
    if not user.get("organisationId"):
        return []
    docs = await db.search_requests.find(
        {"organisationId": user["organisationId"]}
    ).sort("deadline", 1).to_list(500)
    # Verlopen zoekertjes verdwijnen uit deze lijst (blijven wel in de DB — §5)
    return [_public_view(d) for d in docs if _compute_status(d) == "actief"]


@router.get("/search-requests/{search_request_id}")
async def get_search_request(search_request_id: str, user: dict = Depends(get_validated_user)):
    _require_not_donateur(user)
    doc = await db.search_requests.find_one({"$or": [{"id": search_request_id}, {"slug": search_request_id}]})
    if not doc:
        raise HTTPException(404, "Zoekertje niet gevonden")
    is_admin = user.get("role") == "admin"
    if not is_admin and doc.get("organisationId") != user.get("organisationId"):
        raise HTTPException(403, "Geen toegang tot dit zoekertje")
    return _public_view(doc)


@router.post("/search-requests")
async def create_search_request(body: SearchRequestCreateBody, user: dict = Depends(get_validated_user)):
    _require_not_donateur(user)
    if not user.get("organisationId"):
        raise HTTPException(400, "Je hebt geen organisatie gekoppeld aan je account")

    # Server-side verplichte-veldencontrole voor gebruikers (§3-tabel)
    if not body.projectName or not body.projectName.strip():
        raise HTTPException(400, "Projectnaam is verplicht")
    if not body.projectType:
        raise HTTPException(400, "Aard van het project is verplicht")
    if not body.materials or len(body.materials) < 1:
        raise HTTPException(400, "Minstens 1 materiaal is verplicht")

    search_request_id = str(uuid.uuid4())
    now = now_iso()
    slug = await generate_unique_search_request_slug(db, body.projectName, search_request_id)
    deadline = _validate_and_clamp_deadline(body.deadline, is_admin=False)

    doc = body.model_dump()
    doc["materials"] = [m.model_dump() for m in body.materials]
    doc.update({
        "id": search_request_id,
        "slug": slug,
        "deadline": deadline,
        "organisationId": user["organisationId"],
        "createdByUserId": user["id"],
        "createdByAdminId": None,
        "closed": False,
        "createdAt": now,
        "updatedAt": now,
        "updatedByUserId": user["id"],
    })
    await db.search_requests.insert_one(doc)

    # Melding voor de admin-groep (PRD_meldingen_admin.md §6.4) — enkel bij deze
    # gebruikersflow, niet bij de admin-variant hieronder (die is al door een
    # admin zelf aangemaakt). Geen idempotentiecheck nodig: elke aanmaak is
    # een unieke gebeurtenis.
    org = await db.organisations.find_one({"id": user["organisationId"]}, {"_id": 0, "name": 1})
    org_label = (org or {}).get("name") or "een organisatie"
    await create_report(
        db, "new_search_request", "search_request", search_request_id,
        f'{org_label} plaatste een nieuw zoekertje "{doc.get("projectName") or "(geen projectnaam)"}".',
        target_title=doc.get("projectName"),
        meta={"organisationId": user["organisationId"]},
    )

    return _public_view(doc)


@router.patch("/search-requests/{search_request_id}")
async def update_search_request(
    search_request_id: str, body: SearchRequestUpdate, user: dict = Depends(get_validated_user),
):
    _require_not_donateur(user)
    doc = await db.search_requests.find_one({"id": search_request_id})
    if not doc:
        raise HTTPException(404, "Zoekertje niet gevonden")
    is_admin = user.get("role") == "admin"
    if not is_admin and doc.get("organisationId") != user.get("organisationId"):
        raise HTTPException(403, "Enkel leden van de eigen organisatie kunnen dit zoekertje bewerken")

    update: dict = {"updatedAt": now_iso(), "updatedByUserId": user["id"]}
    if body.projectName is not None:
        update["projectName"] = body.projectName.strip() or None
    if body.location is not None:
        update["location"] = body.location.strip() or None
    if body.projectType is not None:
        update["projectType"] = body.projectType
    if body.shortDescription is not None:
        update["shortDescription"] = body.shortDescription.strip() or None
    if body.deadline is not None:
        update["deadline"] = _validate_and_clamp_deadline(body.deadline, is_admin=is_admin)
    if body.photos is not None:
        update["photos"] = body.photos
    if body.materials is not None:
        if len(body.materials) < 1:
            raise HTTPException(400, "Minstens 1 materiaal is verplicht")
        update["materials"] = [m.model_dump() for m in body.materials]
    if body.closed is not None:
        update["closed"] = body.closed  # handmatig afsluiten door de gebruiker (§5)

    await db.search_requests.update_one({"id": search_request_id}, {"$set": update})
    updated = await db.search_requests.find_one({"id": search_request_id})
    return _public_view(updated)


@router.delete("/search-requests/{search_request_id}")
async def delete_search_request(search_request_id: str, user: dict = Depends(get_validated_user)):
    _require_not_donateur(user)
    doc = await db.search_requests.find_one({"id": search_request_id})
    if not doc:
        raise HTTPException(404, "Zoekertje niet gevonden")
    is_admin = user.get("role") == "admin"
    if not is_admin and doc.get("organisationId") != user.get("organisationId"):
        raise HTTPException(403, "Geen toegang")
    await db.search_requests.delete_one({"id": search_request_id})
    return {"ok": True}


# ---------- Adminkant ----------
@router.get("/admin/search-requests")
async def admin_list_search_requests(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    admin: dict = Depends(get_admin_user),
):
    """Projectenlijst, gesorteerd op deadline (kortste eerst) — §6.1.
    Verlopen/afgesloten zoekertjes worden hier niet getoond (blijven in DB)."""
    docs = await db.search_requests.find().sort("deadline", 1).to_list(2000)
    active = [d for d in docs if _compute_status(d) == "actief"]
    total = len(active)
    page = active[skip:skip + limit]

    org_ids = list({d["organisationId"] for d in page if d.get("organisationId")})
    orgs_map: dict[str, dict] = {}
    if org_ids:
        async for o in db.organisations.find({"id": {"$in": org_ids}}, {"_id": 0, "id": 1, "name": 1, "slug": 1}):
            orgs_map[o["id"]] = o

    items = []
    for d in page:
        v = _public_view(d)
        org = orgs_map.get(d.get("organisationId"))
        v["organisation"] = org
        items.append(v)
    return {"items": items, "total": total}


@router.get("/admin/search-requests/{search_request_id}")
async def admin_get_search_request(search_request_id: str, admin: dict = Depends(get_admin_user)):
    """Projectdetailpagina — §6.2: alle info + organisatienaam + contactgegevens indiener."""
    doc = await db.search_requests.find_one({"$or": [{"id": search_request_id}, {"slug": search_request_id}]})
    if not doc:
        raise HTTPException(404, "Zoekertje niet gevonden")
    v = _public_view(doc)
    if doc.get("organisationId"):
        org = await db.organisations.find_one({"id": doc["organisationId"]}, {"_id": 0})
        v["organisation"] = org
    if doc.get("createdByUserId"):
        creator = await db.users.find_one(
            {"id": doc["createdByUserId"]},
            {"_id": 0, "id": 1, "firstName": 1, "lastName": 1, "email": 1, "phone": 1},
        )
        v["createdByUser"] = creator
    return v


@router.get("/admin/search-requests-match")
async def admin_match_search_requests(
    hoofdcategorie: str = Query(...),
    subcategorie: str | None = Query(None),
    admin: dict = Depends(get_admin_user),
):
    """Materiaal-zoekblok / matching-tool — §6.3.
    - Enkel hoofdcategorie: toont alle projecten met eender welke subcategorie
      binnen die hoofdcategorie (incl. projecten die de hoofdcategorie zelf kozen).
    - Hoofdcategorie + subcategorie: enkel projecten met exact die subcategorie.
    Scope v1: één materiaal per zoekopdracht."""
    if hoofdcategorie not in MATERIAL_MAIN_CATEGORY_KEYS:
        raise HTTPException(400, "Onbekende hoofdcategorie")
    if subcategorie and subcategorie not in MATERIAL_SUBCATEGORY_MAP[hoofdcategorie]:
        raise HTTPException(400, "Onbekende subcategorie voor deze hoofdcategorie")

    docs = await db.search_requests.find(
        {"materials.hoofdcategorie": hoofdcategorie}
    ).sort("deadline", 1).to_list(2000)

    org_ids = list({d["organisationId"] for d in docs if d.get("organisationId")})
    orgs_map: dict[str, dict] = {}
    if org_ids:
        async for o in db.organisations.find({"id": {"$in": org_ids}}, {"_id": 0, "id": 1, "name": 1, "slug": 1}):
            orgs_map[o["id"]] = o

    results = []
    for d in docs:
        if _compute_status(d) != "actief":
            continue
        matches = [
            m for m in d.get("materials", [])
            if m.get("hoofdcategorie") == hoofdcategorie
            and (subcategorie is None or m.get("subcategorie") == subcategorie)
        ]
        if not matches:
            continue
        results.append({
            "id": d["id"],
            "slug": d.get("slug"),
            "projectName": d.get("projectName"),
            "deadline": d.get("deadline"),
            "organisation": orgs_map.get(d.get("organisationId")),
            "matchedMaterials": matches,
        })
    return results


@router.post("/admin/search-requests")
async def admin_create_search_request(
    body: SearchRequestAdminCreateBody, admin: dict = Depends(get_admin_user),
):
    """Zoekertje aanmaken namens een organisatie/gebruiker — §6.4.
    Geen enkel veld is technisch verplicht voor de admin."""
    org = await db.organisations.find_one({"id": body.organisationId})
    if not org:
        raise HTTPException(404, "Organisatie niet gevonden")
    if body.createdByUserId:
        creator = await db.users.find_one({"id": body.createdByUserId, "organisationId": body.organisationId})
        if not creator:
            raise HTTPException(400, "Gekozen gebruiker hoort niet bij deze organisatie")

    search_request_id = str(uuid.uuid4())
    now = now_iso()
    slug = await generate_unique_search_request_slug(db, body.projectName, search_request_id)
    deadline = _validate_and_clamp_deadline(body.deadline, is_admin=True)

    doc = body.model_dump(exclude={"organisationId", "createdByUserId"})
    doc["materials"] = [m.model_dump() for m in body.materials]
    doc.update({
        "id": search_request_id,
        "slug": slug,
        "deadline": deadline,
        "organisationId": body.organisationId,
        "createdByUserId": body.createdByUserId,
        "createdByAdminId": admin["id"],
        "closed": False,
        "createdAt": now,
        "updatedAt": now,
        "updatedByUserId": admin["id"],
    })
    await db.search_requests.insert_one(doc)
    return _public_view(doc)
