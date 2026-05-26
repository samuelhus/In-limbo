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
    RegisterNewOrg, RegisterExistingOrg, LoginRequest, AdminDecision,
    ListingBase, OrgUpdate, UserUpdate,
)
from auth import (
    hash_password, verify_password, create_access_token,
    set_auth_cookie, clear_auth_cookie,
    get_current_user, get_current_user_optional,
    get_validated_user, get_admin_user,
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
    await db.organisations.create_index("status")
    await db.listings.create_index("status")
    await db.listings.create_index("organisationId")
    await db.listings.create_index("deadline")
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
    """For non-validated viewers, strip the listing to title/photo/material/status only."""
    l = strip_mongo(dict(listing))
    if viewer and viewer.get("status") == "validated":
        return l
    # Visitors / pending users: limited view
    return {
        "id": l["id"],
        "title": l["title"],
        "material": l["material"],
        "status": l["status"],
        "photos": l["photos"][:1] if l.get("photos") else [],
        "isRecurrent": l.get("isRecurrent", False),
        "limited": True,
    }


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
    if status and status in ("beschikbaar", "in_afwachting", "herbestemd", "in_magazijn"):
        filt["status"] = status

    total = await db.listings.count_documents(filt)
    cursor = db.listings.find(filt).sort("createdAt", -1).skip(skip).limit(limit)
    items = []
    async for l in cursor:
        items.append(_public_listing_view(l, viewer))
    return {"total": total, "items": items, "skip": skip, "limit": limit}


@api.get("/listings/{listing_id}")
async def get_listing(listing_id: str, request: Request):
    listing = await db.listings.find_one({"id": listing_id})
    if not listing:
        raise HTTPException(404, "Aanbieding niet gevonden")
    viewer = await get_current_user_optional(request)
    view = _public_listing_view(listing, viewer)

    # For full view, also attach organisation summary + recurrent contact email
    if not view.get("limited"):
        org = await db.organisations.find_one({"id": listing["organisationId"]})
        if org:
            view["organisation"] = {
                "id": org["id"],
                "name": org["name"],
                "category": org["category"],
            }
        if listing.get("isRecurrent"):
            owner = await db.users.find_one({"id": listing["userId"]})
            if owner:
                view["offererEmail"] = owner["email"]
    return view


@api.post("/listings")
async def create_listing(body: ListingBase, user: dict = Depends(get_validated_user)):
    if body.isRecurrent:
        body.deadline = None
    if not body.photos:
        raise HTTPException(400, "Minstens één foto is vereist")
    listing_id = str(uuid.uuid4())
    now = now_iso()
    doc = body.model_dump()
    doc.update({
        "id": listing_id,
        "status": "beschikbaar",
        "userId": user["id"],
        "organisationId": user["organisationId"],
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
# CLOUDINARY SIGNATURE
# --------------------------------------------------------------------------
@api.get("/cloudinary/signature")
async def cloudinary_signature(user: dict = Depends(get_validated_user)):
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
    """Returns pending users + pending orgs. Groups new-org registrations."""
    pending_users = []
    async for u in db.users.find({"status": "pending"}).sort("createdAt", -1):
        u = strip_mongo(u)
        org = await db.organisations.find_one({"id": u["organisationId"]})
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

    return {"pendingUsers": pending_users, "pendingOrgs": pending_orgs}


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
