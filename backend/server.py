"""In Limbo backend — FastAPI + MongoDB."""
from __future__ import annotations
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import time
import uuid
import logging
from datetime import datetime, timezone

import cloudinary
import cloudinary.utils
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from models import (
    RegisterNewOrg, RegisterExistingOrg, RegisterDonnateur, LoginRequest, AdminDecision,
    ListingBase, ListingCreateBody, OrgUpdate, UserUpdate,
    ApplicationCreate, SelectApplicantBody,
)
from auth import (
    hash_password, verify_password, create_access_token,
    set_auth_cookie, clear_auth_cookie,
    get_current_user, get_current_user_optional,
    get_validated_user, get_admin_user,
    get_donnateur_or_validated_user,
)
from seed import seed
from tasks import archive_expired_listings, mark_inactive_orgs

# --------------------------------------------------------------------------
# Setup
# --------------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    secure=True,
)

app = FastAPI(title="In Limbo API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("inlimbo")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def strip_mongo(d: dict) -> dict:
    d.pop("_id", None)
    d.pop("_seed", None)
    d.pop("passwordHash", None)
    return d


# --------------------------------------------------------------------------
# Startup: indexes + seed + housekeeping
# --------------------------------------------------------------------------
@app.on_event("startup")
async def startup() -> None:
    await db.users.create_index("email", unique=True)
    await db.users.create_index("organisationId")
    await db.users.create_index("username", unique=True, sparse=True)
    await db.organisations.create_index("status")
    await db.listings.create_index("status")
    await db.listings.create_index("organisationId")
    await db.listings.create_index("deadline")
    await db.applications.create_index("listingId")
    await db.applications.create_index("applicantUserId")
    await db.applications.create_index([("listingId", 1), ("applicantUserId", 1)])
    await seed(db)
    archived = await archive_expired_listings(db)
    inactive = await mark_inactive_orgs(db)
    log.info(f"Startup OK — archived={archived} inactive_orgs={inactive}")


@app.on_event("shutdown")
async def shutdown() -> None:
    client.close()


# --------------------------------------------------------------------------
# AUTH ENDPOINTS
# --------------------------------------------------------------------------
@api.post("/auth/register/new-org")
async def register_new_org(body: RegisterNewOrg, response: Response):
    if not body.acceptedTerms:
        raise HTTPException(status_code=400, detail="Je moet de voorwaarden aanvaarden")

    email = body.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="Dit e-mailadres is al geregistreerd")

    org_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    now = now_iso()

    await db.organisations.insert_one({
        "id": org_id,
        "name": body.orgName,
        "description": body.orgDescription,
        "category": body.orgCategory,
        "address": body.orgAddress,
        "website": body.orgWebsite,
        "photos": [],
        "status": "pending",
        "rejectionReason": None,
        "createdAt": now,
        "updatedAt": now,
    })

    await db.users.insert_one({
        "id": user_id,
        "email": email,
        "passwordHash": hash_password(body.password),
        "firstName": body.firstName,
        "lastName": body.lastName,
        "phone": body.phone,
        "role": "user",
        "status": "pending",
        "rejectionReason": None,
        "organisationId": org_id,
        "dateLastLogin": None,
        "createdAt": now,
    })

    token = create_access_token(user_id, email, "user")
    set_auth_cookie(response, token)
    return {"ok": True, "userId": user_id, "organisationId": org_id, "status": "pending"}


@api.post("/auth/register/existing-org")
async def register_existing_org(body: RegisterExistingOrg, response: Response):
    if not body.acceptedTerms:
        raise HTTPException(status_code=400, detail="Je moet de voorwaarden aanvaarden")

    email = body.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="Dit e-mailadres is al geregistreerd")

    org = await db.organisations.find_one({"id": body.organisationId})
    if not org or org["status"] not in ("validated", "active"):
        raise HTTPException(status_code=404, detail="Organisatie niet gevonden of niet gevalideerd")

    user_id = str(uuid.uuid4())
    now = now_iso()
    await db.users.insert_one({
        "id": user_id,
        "email": email,
        "passwordHash": hash_password(body.password),
        "firstName": body.firstName,
        "lastName": body.lastName,
        "phone": body.phone,
        "role": "user",
        "status": "pending",
        "rejectionReason": None,
        "organisationId": body.organisationId,
        "dateLastLogin": None,
        "createdAt": now,
    })

    token = create_access_token(user_id, email, "user")
    set_auth_cookie(response, token)
    return {"ok": True, "userId": user_id, "status": "pending"}


@api.post("/auth/register/donnateur")
async def register_donnateur(body: RegisterDonnateur, response: Response):
    if not body.acceptedTerms:
        raise HTTPException(400, "Je moet de voorwaarden aanvaarden")
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Dit e-mailadres is al geregistreerd")
    if await db.users.find_one({"username": body.username}):
        raise HTTPException(409, "Deze gebruikersnaam is al in gebruik")
    user_id = str(uuid.uuid4())
    now = now_iso()
    await db.users.insert_one({
        "id": user_id,
        "email": email,
        "passwordHash": hash_password(body.password),
        "username": body.username,
        "firstName": None,
        "lastName": None,
        "phone": None,
        "role": "donnateur",
        "status": "validated",
        "rejectionReason": None,
        "organisationId": None,
        "dateLastLogin": None,
        "createdAt": now,
    })
    token = create_access_token(user_id, email, "donnateur")
    set_auth_cookie(response, token)
    return {"ok": True, "userId": user_id, "status": "validated"}


@api.post("/auth/login")
async def login(body: LoginRequest, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["passwordHash"]):
        raise HTTPException(status_code=401, detail="Onjuist e-mailadres of wachtwoord")

    await db.users.update_one({"id": user["id"]}, {"$set": {"dateLastLogin": now_iso()}})
    token = create_access_token(user["id"], user["email"], user["role"])
    set_auth_cookie(response, token)
    user = strip_mongo(dict(user))
    return user


@api.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return strip_mongo(dict(user))


# --------------------------------------------------------------------------
# ORGANISATIONS
# --------------------------------------------------------------------------
@api.get("/organisations")
async def list_organisations(
    q: str = Query("", description="Search query for org name"),
    validated_only: bool = Query(True),
):
    """Public list. If validated_only, only orgs visible to public."""
    filt: dict = {}
    if validated_only:
        filt["status"] = {"$in": ["validated", "active"]}
    if q:
        if len(q) < 2:
            return []
        filt["name"] = {"$regex": q, "$options": "i"}

    cursor = db.organisations.find(filt).sort("name", 1).limit(50)
    out = []
    async for o in cursor:
        out.append(strip_mongo(o))
    return out


@api.get("/organisations/{org_id}")
async def get_organisation(org_id: str):
    org = await db.organisations.find_one({"id": org_id})
    if not org:
        raise HTTPException(404, "Organisatie niet gevonden")
    if org["status"] not in ("validated", "active", "inactive"):
        raise HTTPException(404, "Organisatie niet beschikbaar")
    return strip_mongo(org)


@api.patch("/organisations/{org_id}")
async def update_organisation(
    org_id: str, body: OrgUpdate, user: dict = Depends(get_validated_user),
):
    if user["organisationId"] != org_id and user["role"] != "admin":
        raise HTTPException(403, "Niet toegestaan")
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not update:
        return await get_organisation(org_id)
    update["updatedAt"] = now_iso()
    await db.organisations.update_one({"id": org_id}, {"$set": update})
    return await get_organisation(org_id)


# --------------------------------------------------------------------------
# USERS / PROFILE
# --------------------------------------------------------------------------
@api.patch("/users/me")
async def update_me(body: UserUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "password" in update:
        update["passwordHash"] = hash_password(update.pop("password"))
    if "email" in update:
        update["email"] = update["email"].lower()
        # Check email uniqueness
        if await db.users.find_one({"email": update["email"], "id": {"$ne": user["id"]}}):
            raise HTTPException(409, "E-mailadres is al in gebruik")
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    fresh = await db.users.find_one({"id": user["id"]})
    return strip_mongo(fresh)


# --------------------------------------------------------------------------
# LISTINGS
# --------------------------------------------------------------------------
def _public_listing_view(listing: dict, viewer: dict | None) -> dict:
    """Three visibility levels: validated user/admin (full), donnateur (full minus offerer identity), visitor/pending (limited)."""
    l = strip_mongo(dict(listing))
    # Validated users (role user of admin)
    if viewer and viewer.get("status") == "validated" and viewer.get("role") != "donnateur":
        return l
    # Donnateurs
    if viewer and viewer.get("role") == "donnateur":
        l.pop("userId", None)
        l.pop("offererFirstName", None)
        l.pop("offererUsername", None)
        l.pop("offererIsDonnateur", None)
        l.pop("organisationId", None)
        l.pop("organisation", None)
        return l
    # Visitors / pending users
    return {
        "id": l["id"],
        "title": l["title"],
        "material": l["material"],
        "status": l["status"],
        "photos": l["photos"][:1] if l.get("photos") else [],
        "isRecurrent": l.get("isRecurrent", False),
        "limited": True,
    }


async def _enrich_listings(items: list[dict]) -> list[dict]:
    """Attach offerer info to non-limited views. Donnateurs get offererUsername + offererIsDonnateur; regular users get offererFirstName + organisation."""
    full = [it for it in items if not it.get("limited") and it.get("userId")]
    if not full:
        return items
    user_ids = list({it["userId"] for it in full if it.get("userId")})
    org_ids = list({it["organisationId"] for it in full if it.get("organisationId")})

    users_map: dict[str, dict] = {}
    if user_ids:
        async for u in db.users.find(
            {"id": {"$in": user_ids}},
            {"_id": 0, "id": 1, "firstName": 1, "role": 1, "username": 1},
        ):
            users_map[u["id"]] = u
    orgs_map: dict[str, dict] = {}
    if org_ids:
        async for o in db.organisations.find({"id": {"$in": org_ids}}, {"_id": 0, "id": 1, "name": 1}):
            orgs_map[o["id"]] = o

    for it in full:
        owner = users_map.get(it.get("userId"))
        if not owner:
            continue
        if owner.get("role") == "donnateur":
            it["offererUsername"] = owner.get("username")
            it["offererIsDonnateur"] = True
        else:
            it["offererFirstName"] = owner.get("firstName")
            org = orgs_map.get(it.get("organisationId"))
            if org:
                it["organisation"] = {"id": org["id"], "name": org["name"]}
    return items


@api.get("/listings")
async def list_listings(
    request: Request,
    status: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
):
    """Catalog listing. Excludes gearchiveerd."""
    # Trigger lazy archive on read
    await archive_expired_listings(db)

    viewer = await get_current_user_optional(request)
    filt: dict = {"status": {"$ne": "gearchiveerd"}}
    if status and status in ("beschikbaar", "herbestemd", "in_magazijn"):
        filt["status"] = status

    total = await db.listings.count_documents(filt)
    cursor = db.listings.find(filt).sort("createdAt", -1).skip(skip).limit(limit)
    items = []
    async for l in cursor:
        items.append(_public_listing_view(l, viewer))
    items = await _enrich_listings(items)
    return {"total": total, "items": items, "skip": skip, "limit": limit}


@api.get("/listings/mine")
async def my_listings(user: dict = Depends(get_donnateur_or_validated_user)):
    """Return all listings owned by the authenticated user, with open application counts."""
    cursor = db.listings.find({"userId": user["id"]}).sort("createdAt", -1)
    items = []
    async for l in cursor:
        items.append(strip_mongo(l))
    if not items:
        return []

    # Count open applications per listing
    listing_ids = [it["id"] for it in items]
    counts: dict[str, int] = {lid: 0 for lid in listing_ids}
    pipeline = [
        {"$match": {"listingId": {"$in": listing_ids}, "status": "open"}},
        {"$group": {"_id": "$listingId", "n": {"$sum": 1}}},
    ]
    async for row in db.applications.aggregate(pipeline):
        counts[row["_id"]] = row["n"]

    for it in items:
        it["openApplicationCount"] = counts.get(it["id"], 0)
        # Keep response light — only first photo
        if it.get("photos"):
            it["photos"] = [it["photos"][0]]
    return items


@api.get("/listings/{listing_id}")
async def get_listing(listing_id: str, request: Request):
    listing = await db.listings.find_one({"id": listing_id})
    if not listing:
        raise HTTPException(404, "Aanbieding niet gevonden")
    viewer = await get_current_user_optional(request)
    view = _public_listing_view(listing, viewer)

    # For full view, also attach organisation summary + offerer info + recurrent contact email
    if not view.get("limited"):
        owner = await db.users.find_one({"id": listing["userId"]})
        if owner:
            if owner.get("role") == "donnateur":
                view["offererUsername"] = owner.get("username")
                view["offererIsDonnateur"] = True
            else:
                view["offererFirstName"] = owner.get("firstName")
                org = await db.organisations.find_one({"id": listing.get("organisationId")}) if listing.get("organisationId") else None
                if org:
                    view["organisation"] = {
                        "id": org["id"],
                        "name": org["name"],
                    }
                if listing.get("isRecurrent"):
                    view["offererEmail"] = owner["email"]
        # For donnateur viewers, strip owner identity again (handled in _public_listing_view but redundant attached fields)
        if viewer and viewer.get("role") == "donnateur":
            for k in ("offererFirstName", "offererUsername", "offererIsDonnateur", "organisation", "offererEmail"):
                view.pop(k, None)

        # Application-related context for validated viewers
        if viewer:
            is_owner = viewer["id"] == listing["userId"]
            view["isOwner"] = is_owner

            # Viewer's own application (most recent non-withdrawn first)
            my_app = await db.applications.find_one(
                {"listingId": listing_id, "applicantUserId": viewer["id"]},
                sort=[("createdAt", -1)],
            )
            if my_app:
                view["myApplication"] = {
                    "id": my_app["id"],
                    "status": my_app["status"],
                    "motivation": my_app.get("motivation"),
                    "createdAt": my_app.get("createdAt"),
                }

            # Shared contact when listing is herbestemd AND there is a selected application
            selected_app_id = listing.get("selectedApplicantId")
            if selected_app_id and listing.get("status") == "herbestemd":
                selected_app = await db.applications.find_one({"id": selected_app_id})
                if selected_app:
                    is_selected = my_app and my_app["id"] == selected_app_id and my_app["status"] == "selected"
                    if is_owner:
                        # Show selected applicant's contact to the owner
                        applicant_user = await db.users.find_one({"id": selected_app["applicantUserId"]})
                        applicant_org = await db.organisations.find_one({"id": selected_app["applicantOrganisationId"]})
                        if applicant_user:
                            view["selectedApplicantContact"] = {
                                "firstName": applicant_user.get("firstName"),
                                "lastName": applicant_user.get("lastName"),
                                "email": applicant_user.get("email"),
                                "phone": applicant_user.get("phone"),
                                "organisationName": applicant_org.get("name") if applicant_org else None,
                                "organisationId": applicant_org.get("id") if applicant_org else None,
                            }
                    elif is_selected and owner:
                        # Show offerer's contact to the selected applicant
                        view["selectedApplicantContact"] = {
                            "firstName": owner.get("firstName"),
                            "lastName": owner.get("lastName"),
                            "email": owner.get("email"),
                            "phone": owner.get("phone"),
                            "organisationName": (org or {}).get("name"),
                            "organisationId": (org or {}).get("id"),
                        }
    return view


@api.post("/listings")
async def create_listing(body: ListingCreateBody, user: dict = Depends(get_donnateur_or_validated_user)):
    is_donnateur = user.get("role") == "donnateur"
    if is_donnateur:
        body.isRecurrent = False  # donnateurs cannot create recurrent listings
    if body.isRecurrent:
        body.deadline = None
    if not body.photos:
        raise HTTPException(400, "Minstens één foto is vereist")
    listing_id = str(uuid.uuid4())
    now = now_iso()
    # Only admins may opt-in to placing in magazijn at creation time
    initial_status = "in_magazijn" if (body.placeInWarehouse and user.get("role") == "admin") else "beschikbaar"
    doc = body.model_dump(exclude={"placeInWarehouse"})
    doc.update({
        "id": listing_id,
        "status": initial_status,
        "selectedApplicantId": None,
        "userId": user["id"],
        "organisationId": None if is_donnateur else user.get("organisationId"),
        "createdAt": now,
        "updatedAt": now,
    })
    await db.listings.insert_one(doc)
    return strip_mongo(doc)


@api.get("/organisations/{org_id}/listings")
async def listings_by_org(org_id: str, request: Request):
    """Listings on a public org page — limited if visitor."""
    viewer = await get_current_user_optional(request)
    cursor = db.listings.find({"organisationId": org_id}).sort("createdAt", -1)
    out = []
    async for l in cursor:
        out.append(_public_listing_view(l, viewer))
    return out


# --------------------------------------------------------------------------
# APPLICATIONS — request flow
# --------------------------------------------------------------------------
async def _require_listing_owner_or_admin(listing_id: str, user: dict) -> dict:
    listing = await db.listings.find_one({"id": listing_id})
    if not listing:
        raise HTTPException(404, "Aanbieding niet gevonden")
    if user["id"] != listing["userId"] and user.get("role") != "admin":
        raise HTTPException(403, "Alleen de aanbieder kan deze actie uitvoeren")
    return listing


@api.post("/listings/{listing_id}/apply")
async def apply_to_listing(
    listing_id: str, body: ApplicationCreate, user: dict = Depends(get_validated_user),
):
    if user.get("role") == "donnateur":
        raise HTTPException(403, "Donnateurs kunnen geen aanvragen indienen")
    listing = await db.listings.find_one({"id": listing_id})
    if not listing:
        raise HTTPException(404, "Aanbieding niet gevonden")
    if listing["status"] != "beschikbaar":
        raise HTTPException(400, "Aanvragen kan enkel op beschikbare aanbiedingen")
    if listing.get("isRecurrent"):
        raise HTTPException(400, "Recurrente aanbiedingen aanvaarden geen aanvragen")
    if listing["userId"] == user["id"]:
        raise HTTPException(400, "Je kan geen aanvraag indienen op je eigen aanbieding")
    if listing.get("organisationId") and user.get("organisationId") and listing["organisationId"] == user["organisationId"]:
        raise HTTPException(400, "Je kan geen aanvragen indienen voor aanbiedingen van je eigen organisatie")

    existing = await db.applications.find_one({
        "listingId": listing_id,
        "applicantUserId": user["id"],
        "status": {"$ne": "withdrawn"},
    })
    if existing:
        raise HTTPException(409, "Je hebt al een lopende aanvraag voor deze aanbieding")

    now = now_iso()
    app_doc = {
        "id": str(uuid.uuid4()),
        "listingId": listing_id,
        "applicantUserId": user["id"],
        "applicantOrganisationId": user["organisationId"],
        "motivation": body.motivation,
        "status": "open",
        "createdAt": now,
        "updatedAt": now,
    }
    await db.applications.insert_one(app_doc)
    return strip_mongo(app_doc)


@api.post("/applications/{application_id}/withdraw")
async def withdraw_application(application_id: str, user: dict = Depends(get_validated_user)):
    app_doc = await db.applications.find_one({"id": application_id})
    if not app_doc:
        raise HTTPException(404, "Aanvraag niet gevonden")
    if app_doc["applicantUserId"] != user["id"]:
        raise HTTPException(403, "Niet toegestaan")
    if app_doc["status"] == "withdrawn":
        return {"ok": True}
    was_selected = app_doc["status"] == "selected"
    await db.applications.update_one(
        {"id": application_id},
        {"$set": {"status": "withdrawn", "updatedAt": now_iso()}},
    )
    if was_selected:
        # Same logic as unrehome: reopen all not_selected, set listing back to beschikbaar.
        # withdrawn stays withdrawn (the one we just set).
        listing_id = app_doc["listingId"]
        now = now_iso()
        await db.applications.update_many(
            {"listingId": listing_id, "status": "not_selected"},
            {"$set": {"status": "open", "updatedAt": now}},
        )
        await db.listings.update_one(
            {"id": listing_id},
            {"$set": {"status": "beschikbaar", "selectedApplicantId": None, "updatedAt": now}},
        )
    return {"ok": True}


@api.get("/applications/mine")
async def my_applications(user: dict = Depends(get_validated_user)):
    cursor = db.applications.find({"applicantUserId": user["id"]}).sort("createdAt", -1)
    apps = [strip_mongo(a) async for a in cursor]
    if not apps:
        return []
    listing_ids = list({a["listingId"] for a in apps})
    listings_map: dict[str, dict] = {}
    async for l in db.listings.find({"id": {"$in": listing_ids}}):
        listings_map[l["id"]] = strip_mongo(l)
    org_ids = list({l["organisationId"] for l in listings_map.values()})
    orgs_map: dict[str, dict] = {}
    async for o in db.organisations.find({"id": {"$in": org_ids}}, {"_id": 0, "id": 1, "name": 1}):
        orgs_map[o["id"]] = o
    for a in apps:
        l = listings_map.get(a["listingId"])
        if l:
            a["listing"] = {
                "id": l["id"],
                "title": l["title"],
                "photo": (l.get("photos") or [None])[0],
                "status": l["status"],
                "organisationId": l["organisationId"],
                "organisationName": (orgs_map.get(l["organisationId"]) or {}).get("name"),
            }
    return apps


@api.get("/listings/{listing_id}/applications")
async def list_listing_applications(listing_id: str, user: dict = Depends(get_donnateur_or_validated_user)):
    listing = await _require_listing_owner_or_admin(listing_id, user)
    cursor = db.applications.find(
        {"listingId": listing_id, "status": {"$in": ["open", "selected", "not_selected"]}}
    ).sort("createdAt", 1)
    apps = [strip_mongo(a) async for a in cursor]
    if not apps:
        return []
    user_ids = list({a["applicantUserId"] for a in apps})
    org_ids = list({a["applicantOrganisationId"] for a in apps})
    users_map: dict[str, dict] = {}
    async for u in db.users.find({"id": {"$in": user_ids}}):
        users_map[u["id"]] = u
    orgs_map: dict[str, dict] = {}
    async for o in db.organisations.find({"id": {"$in": org_ids}}):
        orgs_map[o["id"]] = strip_mongo(o)

    selected_id = listing.get("selectedApplicantId")
    out = []
    for a in apps:
        u = users_map.get(a["applicantUserId"]) or {}
        o = orgs_map.get(a["applicantOrganisationId"]) or {}
        is_selected = a["id"] == selected_id and a["status"] == "selected"
        entry = {
            **a,
            "applicant": {
                "firstName": u.get("firstName"),
                "lastName": u.get("lastName"),
                "organisationId": o.get("id"),
                "organisationName": o.get("name"),
                "organisationDescription": o.get("description"),
            },
        }
        if is_selected:
            entry["applicant"]["email"] = u.get("email")
            entry["applicant"]["phone"] = u.get("phone")
        out.append(entry)
    return out


@api.post("/listings/{listing_id}/select-applicant")
async def select_applicant(
    listing_id: str, body: SelectApplicantBody, user: dict = Depends(get_donnateur_or_validated_user),
):
    listing = await _require_listing_owner_or_admin(listing_id, user)
    if listing["status"] != "beschikbaar":
        raise HTTPException(400, "Selectie kan enkel op een beschikbare aanbieding")
    app_doc = await db.applications.find_one({"id": body.applicationId})
    if not app_doc or app_doc["listingId"] != listing_id:
        raise HTTPException(404, "Aanvraag niet gevonden")
    if app_doc["status"] != "open":
        raise HTTPException(400, "Deze aanvraag is niet meer open")
    now = now_iso()
    # Selected applicant → selected
    await db.applications.update_one(
        {"id": body.applicationId},
        {"$set": {"status": "selected", "updatedAt": now}},
    )
    # All other open applications on this listing → not_selected
    await db.applications.update_many(
        {"listingId": listing_id, "status": "open", "id": {"$ne": body.applicationId}},
        {"$set": {"status": "not_selected", "updatedAt": now}},
    )
    # Listing → herbestemd directly
    await db.listings.update_one(
        {"id": listing_id},
        {"$set": {"status": "herbestemd", "selectedApplicantId": body.applicationId, "updatedAt": now}},
    )
    return {"ok": True}


async def _reset_listing_to_available(listing_id: str) -> None:
    """Reset herbestemde listing back to beschikbaar + reopen selected/not_selected applications (withdrawn blijft withdrawn)."""
    now = now_iso()
    await db.applications.update_many(
        {"listingId": listing_id, "status": {"$in": ["selected", "not_selected"]}},
        {"$set": {"status": "open", "updatedAt": now}},
    )
    await db.listings.update_one(
        {"id": listing_id},
        {"$set": {"status": "beschikbaar", "selectedApplicantId": None, "updatedAt": now}},
    )


@api.post("/listings/{listing_id}/unrehome")
async def unrehome(listing_id: str, user: dict = Depends(get_donnateur_or_validated_user)):
    listing = await _require_listing_owner_or_admin(listing_id, user)
    if listing["status"] != "herbestemd":
        raise HTTPException(400, "Deze aanbieding is niet herbestemd")
    await _reset_listing_to_available(listing_id)
    return {"ok": True}


# Backwards-compat alias for older clients
@api.post("/listings/{listing_id}/unselect")
async def unselect_applicant(listing_id: str, user: dict = Depends(get_donnateur_or_validated_user)):
    return await unrehome(listing_id, user)


@api.post("/listings/{listing_id}/mark-rehomed")
async def mark_rehomed(listing_id: str, user: dict = Depends(get_donnateur_or_validated_user)):
    """Aanbieder herbestemt zonder iemand te selecteren (materiaal buiten platform weggegeven)."""
    listing = await _require_listing_owner_or_admin(listing_id, user)
    if listing["status"] != "beschikbaar":
        raise HTTPException(400, "Aanbieding kan niet naar herbestemd gezet worden vanuit deze status")
    now = now_iso()
    await db.applications.update_many(
        {"listingId": listing_id, "status": "open"},
        {"$set": {"status": "not_selected", "updatedAt": now}},
    )
    await db.listings.update_one(
        {"id": listing_id},
        {"$set": {"status": "herbestemd", "updatedAt": now}},
    )
    return {"ok": True}


@api.delete("/listings/{listing_id}")
async def delete_listing(listing_id: str, user: dict = Depends(get_donnateur_or_validated_user)):
    listing = await _require_listing_owner_or_admin(listing_id, user)
    if listing["status"] == "herbestemd":
        raise HTTPException(403, "Herbestemde aanbiedingen kunnen niet verwijderd worden.")
    await db.applications.delete_many({"listingId": listing_id})
    await db.listings.delete_one({"id": listing_id})
    return {"success": True}



# --------------------------------------------------------------------------
# CLOUDINARY SIGNATURE
# --------------------------------------------------------------------------
@api.get("/cloudinary/signature")
async def cloudinary_signature(user: dict = Depends(get_donnateur_or_validated_user)):
    folder = f"in-limbo/{user['id']}"
    timestamp = int(time.time())
    params = {"timestamp": timestamp, "folder": folder}
    signature = cloudinary.utils.api_sign_request(
        params, os.environ["CLOUDINARY_API_SECRET"]
    )
    return {
        "signature": signature,
        "timestamp": timestamp,
        "cloud_name": os.environ["CLOUDINARY_CLOUD_NAME"],
        "api_key": os.environ["CLOUDINARY_API_KEY"],
        "folder": folder,
    }


# --------------------------------------------------------------------------
# ADMIN
# --------------------------------------------------------------------------
@api.get("/admin/validation-queue")
async def admin_queue(admin: dict = Depends(get_admin_user)):
    """Returns pending users + pending orgs + donnateurs. Groups new-org registrations."""
    pending_users = []
    async for u in db.users.find({"status": "pending"}).sort("createdAt", -1):
        u = strip_mongo(u)
        org = await db.organisations.find_one({"id": u.get("organisationId")}) if u.get("organisationId") else None
        u["organisation"] = strip_mongo(org) if org else None
        # Find any previously rejected applications for context
        previous = await db.users.count_documents({
            "email": u["email"], "status": "rejected", "id": {"$ne": u["id"]},
        })
        u["previousRejections"] = previous
        pending_users.append(u)

    pending_orgs = []
    async for o in db.organisations.find({"status": "pending"}).sort("createdAt", -1):
        pending_orgs.append(strip_mongo(o))

    donnateurs = []
    async for u in db.users.find({"role": "donnateur"}).sort("createdAt", -1):
        donnateurs.append(strip_mongo(u))

    return {"pendingUsers": pending_users, "pendingOrgs": pending_orgs, "donnateurs": donnateurs}


@api.post("/admin/users/{user_id}/decision")
async def admin_decide_user(
    user_id: str, body: AdminDecision, admin: dict = Depends(get_admin_user),
):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "Gebruiker niet gevonden")
    now = now_iso()

    if body.decision == "approve":
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"status": "validated", "rejectionReason": None}},
        )
        # If the user owns a pending org, validate that too
        org = await db.organisations.find_one({"id": target["organisationId"]})
        if org and org["status"] == "pending":
            await db.organisations.update_one(
                {"id": org["id"]},
                {"$set": {"status": "active", "updatedAt": now}},
            )
        return {"ok": True, "status": "validated"}

    # reject
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"status": "rejected", "rejectionReason": body.rejectionReason}},
    )
    # If the user owned a pending org and is the only member, mark org rejected
    org = await db.organisations.find_one({"id": target["organisationId"]})
    if org and org["status"] == "pending":
        other_members = await db.users.count_documents({
            "organisationId": org["id"], "id": {"$ne": user_id},
        })
        if other_members == 0:
            await db.organisations.update_one(
                {"id": org["id"]},
                {"$set": {"status": "rejected", "rejectionReason": body.rejectionReason, "updatedAt": now}},
            )
    return {"ok": True, "status": "rejected"}


@api.post("/admin/organisations/{org_id}/decision")
async def admin_decide_org(
    org_id: str, body: AdminDecision, admin: dict = Depends(get_admin_user),
):
    org = await db.organisations.find_one({"id": org_id})
    if not org:
        raise HTTPException(404, "Organisatie niet gevonden")
    if body.decision == "approve":
        await db.organisations.update_one(
            {"id": org_id}, {"$set": {"status": "active", "updatedAt": now_iso()}}
        )
        return {"ok": True}
    await db.organisations.update_one(
        {"id": org_id},
        {"$set": {"status": "rejected", "rejectionReason": body.rejectionReason, "updatedAt": now_iso()}},
    )
    return {"ok": True}


@api.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(get_admin_user)):
    """Delete a donnateur account. Archives all their listings."""
    result = await db.users.delete_one({"id": user_id, "role": "donnateur"})
    if result.deleted_count == 0:
        raise HTTPException(404, "Donnateur niet gevonden of geen donnateur-account")
    await db.listings.update_many({"userId": user_id}, {"$set": {"status": "gearchiveerd", "updatedAt": now_iso()}})
    return {"ok": True}


@api.post("/admin/maintenance/run")
async def admin_run_maintenance(admin: dict = Depends(get_admin_user)):
    archived = await archive_expired_listings(db)
    inactive = await mark_inactive_orgs(db)
    return {"archived": archived, "inactiveOrgs": inactive}


# --------------------------------------------------------------------------
# HEALTH
# --------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"app": "In Limbo", "ok": True}


# --------------------------------------------------------------------------
# Mount + CORS
# --------------------------------------------------------------------------
app.include_router(api)

frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
