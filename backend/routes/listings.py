"""Listings: catalog, mine, get, create, update, delete + helpers shared with applications.

Also exposes _public_listing_view en _require_listing_owner_or_admin via dit module
zodat het applications-router deze kan hergebruiken.
"""
from __future__ import annotations
import os
import time
import uuid

import cloudinary.utils
from fastapi import APIRouter, HTTPException, Depends, Request, Query

from deps import db, now_iso, strip_mongo
from models import ListingCreateBody, ListingUpdate
from auth import (
    get_current_user_optional, get_donateur_or_validated_user,
)
from tasks import archive_expired_listings

router = APIRouter()


def _public_listing_view(listing: dict, viewer: dict | None) -> dict:
    """Three visibility levels: validated user/admin (full), donateur (full minus offerer identity), visitor/pending (limited)."""
    lst = strip_mongo(dict(listing))
    if viewer and viewer.get("status") == "validated" and viewer.get("role") != "donateur":
        return lst
    if viewer and viewer.get("role") == "donateur":
        lst.pop("userId", None)
        lst.pop("offererFirstName", None)
        lst.pop("offererUsername", None)
        lst.pop("offererIsDonateur", None)
        lst.pop("organisationId", None)
        lst.pop("organisation", None)
        return lst
    return {
        "id": lst["id"],
        "title": lst["title"],
        "material": lst["material"],
        "status": lst["status"],
        "photos": lst["photos"][:1] if lst.get("photos") else [],
        "isRecurrent": lst.get("isRecurrent", False),
        "limited": True,
    }


async def _enrich_listings(items: list[dict]) -> list[dict]:
    """Attach offerer info to non-limited views."""
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
        if owner.get("role") == "donateur":
            it["offererUsername"] = owner.get("username")
            it["offererIsDonateur"] = True
        else:
            it["offererFirstName"] = owner.get("firstName")
            org = orgs_map.get(it.get("organisationId"))
            if org:
                it["organisation"] = {"id": org["id"], "name": org["name"]}
    return items


async def _require_listing_owner_or_admin(listing_id: str, user: dict) -> dict:
    listing = await db.listings.find_one({"id": listing_id})
    if not listing:
        raise HTTPException(404, "Aanbieding niet gevonden")
    if user["id"] != listing["userId"] and user.get("role") != "admin":
        raise HTTPException(403, "Alleen de aanbieder kan deze actie uitvoeren")
    listing.pop("_id", None)
    return listing


@router.get("/listings")
async def list_listings(
    request: Request,
    filter_key: str | None = Query(None, alias="filter"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
):
    """Catalog listing. Excludes gearchiveerd."""
    await archive_expired_listings(db)

    viewer = await get_current_user_optional(request)
    filt: dict = {"status": {"$ne": "gearchiveerd"}}
    if filter_key == "beschikbaar":
        filt["status"] = {"$in": ["beschikbaar", "in_magazijn"]}
    elif filter_key == "in_magazijn":
        filt["status"] = "in_magazijn"
    elif filter_key == "herbestemd":
        filt["status"] = "herbestemd"

    total = await db.listings.count_documents(filt)
    cursor = db.listings.find(filt).sort("createdAt", -1).skip(skip).limit(limit)
    items = []
    async for lst in cursor:
        items.append(_public_listing_view(lst, viewer))
    items = await _enrich_listings(items)
    return {"total": total, "items": items, "skip": skip, "limit": limit}


@router.get("/listings/mine")
async def my_listings(user: dict = Depends(get_donateur_or_validated_user)):
    """Return all listings owned by the authenticated user, with open application counts."""
    cursor = db.listings.find({"userId": user["id"]}).sort("createdAt", -1)
    items = []
    async for lst in cursor:
        items.append(strip_mongo(lst))
    if not items:
        return []

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
        if it.get("photos"):
            it["photos"] = [it["photos"][0]]
    return items


@router.get("/listings/{listing_id}")
async def get_listing(listing_id: str, request: Request):
    listing = await db.listings.find_one({"id": listing_id})
    if not listing:
        raise HTTPException(404, "Aanbieding niet gevonden")
    viewer = await get_current_user_optional(request)
    view = _public_listing_view(listing, viewer)

    if not view.get("limited"):
        owner = await db.users.find_one({"id": listing["userId"]})
        if owner:
            if owner.get("role") == "donateur":
                view["offererUsername"] = owner.get("username")
                view["offererIsDonateur"] = True
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
        if viewer and viewer.get("role") == "donateur":
            for k in ("offererFirstName", "offererUsername", "offererIsDonateur", "organisation", "offererEmail"):
                view.pop(k, None)

        if viewer:
            is_owner = viewer["id"] == listing["userId"]
            view["isOwner"] = is_owner

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

            selected_app_id = listing.get("selectedApplicantId")
            if selected_app_id and listing.get("status") == "herbestemd":
                selected_app = await db.applications.find_one({"id": selected_app_id})
                if selected_app:
                    is_selected = my_app and my_app["id"] == selected_app_id and my_app["status"] == "selected"
                    if is_owner:
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
                        owner_org = await db.organisations.find_one({"id": listing.get("organisationId")}) if listing.get("organisationId") else None
                        view["selectedApplicantContact"] = {
                            "firstName": owner.get("firstName"),
                            "lastName": owner.get("lastName"),
                            "email": owner.get("email"),
                            "phone": owner.get("phone"),
                            "organisationName": (owner_org or {}).get("name"),
                            "organisationId": (owner_org or {}).get("id"),
                        }
    return view


@router.post("/listings")
async def create_listing(body: ListingCreateBody, user: dict = Depends(get_donateur_or_validated_user)):
    is_donateur = user.get("role") == "donateur"
    if is_donateur:
        body.isRecurrent = False
    if body.isRecurrent:
        body.deadline = None
    if not body.photos:
        raise HTTPException(400, "Minstens één foto is vereist")
    listing_id = str(uuid.uuid4())
    now = now_iso()
    initial_status = "in_magazijn" if (body.placeInWarehouse and user.get("role") == "admin") else "beschikbaar"
    doc = body.model_dump(exclude={"placeInWarehouse"})
    doc.update({
        "id": listing_id,
        "status": initial_status,
        "selectedApplicantId": None,
        "userId": user["id"],
        "organisationId": None if is_donateur else user.get("organisationId"),
        "createdAt": now,
        "updatedAt": now,
    })
    await db.listings.insert_one(doc)
    return strip_mongo(doc)


@router.patch("/listings/{listing_id}")
async def update_listing(
    listing_id: str,
    body: ListingUpdate,
    user: dict = Depends(get_donateur_or_validated_user),
):
    listing = await db.listings.find_one({"id": listing_id})
    if not listing:
        raise HTTPException(404, "Aanbieding niet gevonden")

    if listing["userId"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(403, "Geen toegang")

    editable_statuses = {"beschikbaar", "gearchiveerd"}
    if user.get("role") == "admin":
        editable_statuses.add("in_magazijn")
    if listing["status"] not in editable_statuses:
        raise HTTPException(400, "Deze aanbieding kan niet bewerkt worden")

    now = now_iso()
    update: dict = {"updatedAt": now}

    if body.title is not None:
        update["title"] = body.title.strip()
    if body.description is not None:
        update["description"] = body.description.strip()
    if body.weight is not None:
        update["weight"] = body.weight
    if body.material is not None:
        update["material"] = body.material
    if body.photos is not None:
        update["photos"] = body.photos
    if body.dimensions is not None:
        update["dimensions"] = body.dimensions
    if body.transport is not None:
        update["transport"] = body.transport
    if body.isRecurrent is not None:
        update["isRecurrent"] = body.isRecurrent
        if body.isRecurrent:
            update["deadline"] = None
    if body.deadline is not None:
        update["deadline"] = body.deadline
    if body.placeInWarehouse is not None and user.get("role") == "admin":
        update["placeInWarehouse"] = body.placeInWarehouse

    if user.get("role") == "donateur" and update.get("isRecurrent"):
        update["isRecurrent"] = False
        update["deadline"] = update.get("deadline") or listing.get("deadline")

    if listing["status"] == "gearchiveerd":
        deadline = update.get("deadline") if "deadline" in update else listing.get("deadline")
        is_recurrent = update.get("isRecurrent", listing.get("isRecurrent", False))
        if is_recurrent or (deadline and deadline >= now[:10]):
            update["status"] = "beschikbaar"

    await db.listings.update_one({"id": listing_id}, {"$set": update})
    updated = await db.listings.find_one({"id": listing_id})
    return strip_mongo(updated)


@router.get("/organisations/{org_id}/listings")
async def listings_by_org(org_id: str, request: Request):
    """Listings on a public org page — limited if visitor."""
    viewer = await get_current_user_optional(request)
    cursor = db.listings.find({"organisationId": org_id}).sort("createdAt", -1)
    out = []
    async for lst in cursor:
        out.append(_public_listing_view(lst, viewer))
    return out


@router.delete("/listings/{listing_id}")
async def delete_listing(listing_id: str, user: dict = Depends(get_donateur_or_validated_user)):
    listing = await _require_listing_owner_or_admin(listing_id, user)
    if listing["status"] == "herbestemd":
        raise HTTPException(403, "Herbestemde aanbiedingen kunnen niet verwijderd worden.")
    await db.applications.delete_many({"listingId": listing_id})
    await db.listings.delete_one({"id": listing_id})
    return {"success": True}


# Cloudinary signature voor foto-uploads
@router.get("/cloudinary/signature")
async def cloudinary_signature(user: dict = Depends(get_donateur_or_validated_user)):
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
