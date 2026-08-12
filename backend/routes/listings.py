"""Listings: catalog, mine, get, create, update, delete + helpers shared with applications.

Also exposes _public_listing_view en _require_listing_owner_or_admin via dit module
zodat het applications-router deze kan hergebruiken.
"""
from __future__ import annotations
import os
import re
import time
import uuid

import cloudinary.utils
from fastapi import APIRouter, HTTPException, Depends, Request, Query

from deps import db, now_iso, strip_mongo, generate_unique_listing_slug
from auth import get_admin_user

from models import ListingCreateBody, ListingUpdate
from auth import (
    get_current_user_optional, get_donateur_or_validated_user,
)
from search_keywords import enrich_listing_keywords, DICTIONARY
from notifications import notify_ntfy, NTFY_TOPIC_LISTINGS, FRONTEND_URL

router = APIRouter()


def _public_listing_view(listing: dict, viewer: dict | None) -> dict:
    """Three visibility levels: validated user/admin (full), donateur (full minus offerer identity), visitor/pending (limited)."""
    lst = strip_mongo(dict(listing))
    # searchKeywords is server-only — never exposed in any response
    lst.pop("searchKeywords", None)
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
        "slug": lst.get("slug"),
        "title": lst["title"],
        "material": lst["material"],
        "status": lst["status"],
        "quantity": lst.get("quantity", 1),
        "remainingQuantity": lst.get("remainingQuantity", lst.get("quantity", 1)),
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
                it["organisation"] = {"id": org["id"], "name": org["name"], "slug": org.get("slug")}
    return items


def _can_manage_listing(user: dict, listing: dict) -> bool:
    """True als user deze listing mag bewerken/verwijderen: de aanbieder zelf,
    een admin, of een ander lid van dezelfde organisatie (donateurs — die geen
    organisationId hebben — vallen hier niet onder)."""
    if user.get("role") == "admin":
        return True
    if user["id"] == listing["userId"]:
        return True
    user_org = user.get("organisationId")
    listing_org = listing.get("organisationId")
    if user_org and listing_org and user_org == listing_org:
        return True
    return False


async def _require_listing_owner_or_admin(listing_id: str, user: dict) -> dict:
    listing = await db.listings.find_one({"id": listing_id})
    if not listing:
        raise HTTPException(404, "Aanbieding niet gevonden")
    if not _can_manage_listing(user, listing):
        raise HTTPException(403, "Alleen de aanbieder of een lid van dezelfde organisatie kan deze actie uitvoeren")
    listing.pop("_id", None)
    return listing


@router.get("/listings")
async def list_listings(
    request: Request,
    filter_key: str | None = Query(None, alias="filter"),
    q: str | None = Query(None, max_length=100),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
):
    """Catalog listing. Excludes gearchiveerd.

    When `q` is non-empty, performs a regex-based substring search across
    title, description, material and searchKeywords. Each query token must
    match at least one of those fields (AND logic). Full-word synonyms from
    the bilingual dictionary are automatically added as alternatives per token,
    enabling cross-language search (e.g. "stoel" also finds listings with "chaise").
    Returns isSearch:true.
    """
    viewer = await get_current_user_optional(request)

    q_clean = (q or "").strip()
    if q_clean:
        # Build a set of search terms: the original query + any dictionary synonyms
        # for whole words found in the query.
        base_terms = [t.strip(".,;:!?()").lower() for t in q_clean.split() if t.strip(".,;:!?()")]
        all_terms: set[str] = set(base_terms)
        for word in base_terms:
            if word in DICTIONARY:
                all_terms.update(DICTIONARY[word])

        # Each term is matched as a substring (case-insensitive) against
        # title, description, material, and searchKeywords.
        # A listing matches if ALL original query tokens are found (AND logic),
        # with synonyms acting as alternatives for each token.
        def _term_clause(term: str) -> dict:
            pattern = {"$regex": re.escape(term), "$options": "i"}
            return {"$or": [
                {"title": pattern},
                {"description": pattern},
                {"material": pattern},
                {"searchKeywords": pattern},
            ]}

        # For each original token, accept the token itself OR any of its synonyms.
        token_clauses = []
        for word in base_terms:
            synonyms = [word] + ([s for s in DICTIONARY.get(word, [])])
            token_clauses.append({"$or": [_term_clause(s) for s in synonyms]})

        filt = {
            "status": {"$ne": "gearchiveerd"},
            "$and": token_clauses,
        }

        total = await db.listings.count_documents(filt)
        cursor = (
            db.listings.find(filt)
            .sort("createdAt", -1)
            .skip(skip)
            .limit(limit)
        )
        items = []
        async for lst in cursor:
            items.append(_public_listing_view(lst, viewer))
        items = await _enrich_listings(items)
        return {"total": total, "items": items, "skip": skip, "limit": limit, "isSearch": True}

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
    return {"total": total, "items": items, "skip": skip, "limit": limit, "isSearch": False}

@router.get("/listings/by-user/{user_id}")
async def listings_by_user(user_id: str, admin: dict = Depends(get_admin_user)):
    cursor = db.listings.find({"userId": user_id}).sort("createdAt", -1)
    items = await cursor.to_list(200)
    return [strip_mongo(i) for i in items]

@router.get("/listings/mine")
async def my_listings(user: dict = Depends(get_donateur_or_validated_user)):
    """Return alle listings die deze gebruiker mag beheren: de eigen listings,
    plus (indien lid van een organisatie) de listings van organisatiegenoten —
    zij kunnen elkaars aanbiedingen aanpassen. Donateurs (geen organisationId)
    zien enkel hun eigen listings."""
    org_id = user.get("organisationId")
    query = {"$or": [{"userId": user["id"]}, {"organisationId": org_id}]} if org_id else {"userId": user["id"]}
    cursor = db.listings.find(query).sort("createdAt", -1)
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

    # Naam van de plaatser meesturen (enkel relevant zodra ook organisatiegenoten
    # hun listings zien) — één batch-query i.p.v. per item.
    poster_ids = {it["userId"] for it in items if it["userId"] != user["id"]}
    names: dict[str, str] = {}
    if poster_ids:
        async for u in db.users.find({"id": {"$in": list(poster_ids)}}, {"_id": 0, "id": 1, "firstName": 1, "lastName": 1}):
            names[u["id"]] = f"{u.get('firstName', '')} {u.get('lastName', '')}".strip()

    for it in items:
        it["openApplicationCount"] = counts.get(it["id"], 0)
        it["postedByName"] = None if it["userId"] == user["id"] else names.get(it["userId"])
        if it.get("photos"):
            it["photos"] = [it["photos"][0]]
    return items


@router.get("/listings/{listing_id}")
async def get_listing(listing_id: str, request: Request):
    listing = await db.listings.find_one({"$or": [{"id": listing_id}, {"slug": listing_id}]})
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
                        "slug": org.get("slug"),
                    }
                if listing.get("isRecurrent"):
                    view["offererEmail"] = owner["email"]
        if viewer and viewer.get("role") == "donateur":
            for k in ("offererFirstName", "offererUsername", "offererIsDonateur", "organisation", "offererEmail"):
                view.pop(k, None)

        if viewer:
            is_owner = viewer["id"] == listing["userId"] or (
                listing.get("organisationId") is not None
                and viewer.get("organisationId") == listing.get("organisationId")
            )
            view["isOwner"] = is_owner

            my_app = await db.applications.find_one(
                {"listingId": listing["id"], "applicantUserId": viewer["id"]},
                sort=[("createdAt", -1)],
            )
            if my_app:
                view["myApplication"] = {
                    "id": my_app["id"],
                    "status": my_app["status"],
                    "motivation": my_app.get("motivation"),
                    "createdAt": my_app.get("createdAt"),
                    "requestedQuantity": my_app.get("requestedQuantity", 1),
                    "allocatedQuantity": my_app.get("allocatedQuantity"),
                }

            selected_ids = listing.get("selectedApplicantIds") or []
            if selected_ids:
                selected_apps = await db.applications.find({"id": {"$in": selected_ids}}).to_list(len(selected_ids))
                if is_owner:
                    contacts = []
                    for sel in selected_apps:
                        applicant_user = await db.users.find_one({"id": sel["applicantUserId"]})
                        applicant_org = await db.organisations.find_one({"id": sel["applicantOrganisationId"]})
                        if applicant_user:
                            contacts.append({
                                "applicationId": sel["id"],
                                "allocatedQuantity": sel.get("allocatedQuantity"),
                                "firstName": applicant_user.get("firstName"),
                                "lastName": applicant_user.get("lastName"),
                                "email": applicant_user.get("email"),
                                "phone": applicant_user.get("phone"),
                                "organisationName": applicant_org.get("name") if applicant_org else None,
                                "organisationId": applicant_org.get("id") if applicant_org else None,
                            })
                    view["selectedApplicantsContacts"] = contacts
                elif my_app and my_app["id"] in selected_ids and my_app["status"] == "selected" and owner:
                    owner_org = await db.organisations.find_one({"id": listing.get("organisationId")}) if listing.get("organisationId") else None
                    view["selectedApplicantsContacts"] = [{
                        "applicationId": my_app["id"],
                        "allocatedQuantity": my_app.get("allocatedQuantity"),
                        "requestedQuantity": my_app.get("requestedQuantity", 1),
                        "firstName": owner.get("firstName"),
                        "lastName": owner.get("lastName"),
                        "email": owner.get("email"),
                        "phone": owner.get("phone"),
                        "organisationName": (owner_org or {}).get("name"),
                        "organisationId": (owner_org or {}).get("id"),
                    }]
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
    slug = await generate_unique_listing_slug(db, body.title, listing_id)
    initial_status = "in_magazijn" if (body.placeInWarehouse and user.get("role") == "admin") else "beschikbaar"
    doc = body.model_dump(exclude={"placeInWarehouse"})
    doc.update({
        "id": listing_id,
        "slug": slug,
        "status": initial_status,
        "selectedApplicantIds": [],
        "remainingQuantity": body.quantity,
        "userId": user["id"],
        "organisationId": None if is_donateur else user.get("organisationId"),
        "createdAt": now,
        "updatedAt": now,
    })
    await db.listings.insert_one(doc)
    # Best-effort: enrich searchKeywords so the listing is immediately findable
    try:
        kws = await enrich_listing_keywords(doc)
        if kws is not None:
            await db.listings.update_one({"id": listing_id}, {"$set": {"searchKeywords": kws}})
    except Exception:
        pass

    # Best-effort: ntfy-melding op de aparte "listings"-feed bij elke nieuwe aanbieding
    try:
        offerer_label = None
        if doc.get("organisationId"):
            org = await db.organisations.find_one({"id": doc["organisationId"]})
            offerer_label = org["name"] if org else None
        if not offerer_label:
            offerer_label = f'{user.get("firstName", "")} {user.get("lastName", "")}'.strip() or "Iemand"
        await notify_ntfy(
            title="Nieuwe aanbieding",
            message=f'{offerer_label} plaatste "{body.title}" ({body.material}).',
            priority="default",
            tags=["package"],
            click_url=f"{FRONTEND_URL}/aanbieding/{slug}",
            topic=NTFY_TOPIC_LISTINGS,
        )
    except Exception:
        pass

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

    if not _can_manage_listing(user, listing):
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
    if body.quantity is not None:
        already_allocated = listing.get("quantity", 1) - listing.get("remainingQuantity", listing.get("quantity", 1))
        if body.quantity < already_allocated:
            raise HTTPException(
                400,
                f"Aantal kan niet lager dan {already_allocated} — er is al {already_allocated}x toegewezen aan aanvragers.",
            )
        update["quantity"] = body.quantity
        update["remainingQuantity"] = body.quantity - already_allocated
    if body.photos is not None:
        update["photos"] = body.photos
    if body.technicalFiles is not None:
        update["technicalFiles"] = body.technicalFiles
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
    # Refresh searchKeywords if any searchable field changed
    if any(k in update for k in ("title", "description", "material")):
        try:
            kws = await enrich_listing_keywords(updated)
            if kws is not None:
                await db.listings.update_one({"id": listing_id}, {"$set": {"searchKeywords": kws}})
                updated["searchKeywords"] = kws
        except Exception:
            pass
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


# Cloudinary signature voor PDF-uploads (raw resource type)
@router.get("/cloudinary/pdf-signature")
async def cloudinary_pdf_signature(user: dict = Depends(get_donateur_or_validated_user)):
    folder = f"in-limbo/{user['id']}/fiches"
    timestamp = int(time.time())
    params = {"timestamp": timestamp, "folder": folder, "access_mode": "public"}
    signature = cloudinary.utils.api_sign_request(
        params, os.environ["CLOUDINARY_API_SECRET"]
    )
    return {
        "signature": signature,
        "timestamp": timestamp,
        "cloud_name": os.environ["CLOUDINARY_CLOUD_NAME"],
        "api_key": os.environ["CLOUDINARY_API_KEY"],
        "folder": folder,
        "access_mode": "public",
    }
