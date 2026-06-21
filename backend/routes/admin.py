"""Admin routes: validatie-queue, beslissingen, gebruikers/orgs CRUD, onderhoud, statistieken."""
from __future__ import annotations
import calendar

from fastapi import APIRouter, HTTPException, Depends, Query

from deps import db, now_iso, strip_mongo
from models import AdminDecision, AdminUserUpdate, AdminOrgUpdate
from auth import get_admin_user
from notifications import maybe_send_email, render_email, FRONTEND_URL
from tasks import archive_expired_listings, mark_inactive_orgs

router = APIRouter()


@router.get("/admin/validation-queue")
async def admin_queue(admin: dict = Depends(get_admin_user)):
    """Returns pending users + pending orgs + donateurs. Groups new-org registrations."""
    pending_users = []
    async for u in db.users.find({"status": "pending"}).sort("createdAt", -1):
        u = strip_mongo(u)
        org = await db.organisations.find_one({"id": u.get("organisationId")}) if u.get("organisationId") else None
        u["organisation"] = strip_mongo(org) if org else None
        previous = await db.users.count_documents({
            "email": u["email"], "status": "rejected", "id": {"$ne": u["id"]},
        })
        u["previousRejections"] = previous
        pending_users.append(u)

    pending_orgs = []
    async for o in db.organisations.find({"status": "pending"}).sort("createdAt", -1):
        pending_orgs.append(strip_mongo(o))

    donateurs = []
    async for u in db.users.find({"role": "donateur"}).sort("createdAt", -1):
        donateurs.append(strip_mongo(u))

    return {"pendingUsers": pending_users, "pendingOrgs": pending_orgs, "donateurs": donateurs}


@router.post("/admin/users/{user_id}/decision")
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
        org = await db.organisations.find_one({"id": target["organisationId"]})
        if org and org["status"] == "pending":
            await db.organisations.update_one(
                {"id": org["id"]},
                {"$set": {"status": "active", "updatedAt": now}},
            )
        first = target.get("firstName") or target.get("username") or ""
        html = render_email(
            "Welkom bij In Limbo",
            [
                f"Dag {first},",
                "Je account is geactiveerd. Je hebt nu toegang tot de volledige catalogus en kan aanvragen indienen of materiaal aanbieden.",
                "Bedankt om mee te bouwen aan een circulaire culturele sector in Brussel.",
            ],
            cta_text="Ga naar het platform →", cta_url=f"{FRONTEND_URL}/catalogus",
        )
        await maybe_send_email(db, user_id, "account_validated", target.get("email"),
                               "Welkom bij In Limbo — je account is geactiveerd", html)
        return {"ok": True, "status": "validated"}

    # reject
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"status": "rejected", "rejectionReason": body.rejectionReason}},
    )
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


@router.post("/admin/organisations/{org_id}/decision")
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


@router.get("/admin/users")
async def admin_list_users(
    q: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    admin: dict = Depends(get_admin_user)
):
    filt: dict = {}
    if q and len(q) >= 2:
        regex = {"$regex": q, "$options": "i"}
        filt["$or"] = [
            {"firstName": regex}, {"lastName": regex},
            {"username": regex}, {"email": regex},
        ]
    total = await db.users.count_documents(filt)
    users = await db.users.find(filt, {"_id": 0, "passwordHash": 0}).skip(skip).limit(limit).to_list(limit)
    org_ids = [u["organisationId"] for u in users if u.get("organisationId")]
    orgs: dict = {}
    if org_ids:
        async for o in db.organisations.find({"id": {"$in": org_ids}}, {"_id": 0, "id": 1, "name": 1}):
            orgs[o["id"]] = o["name"]
    for u in users:
        u["organisationName"] = orgs.get(u.get("organisationId"))
    return {"total": total, "items": users}


@router.patch("/admin/users/{user_id}")
async def admin_update_user(user_id: str, body: AdminUserUpdate, admin: dict = Depends(get_admin_user)):
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(404, "Gebruiker niet gevonden")
    update = {"updatedAt": now_iso()}
    if body.firstName is not None:
        update["firstName"] = body.firstName
    if body.lastName is not None:
        update["lastName"] = body.lastName
    if body.username is not None:
        update["username"] = body.username
    if body.email is not None:
        clash = await db.users.find_one({"email": body.email.lower(), "id": {"$ne": user_id}})
        if clash:
            raise HTTPException(409, "E-mailadres al in gebruik")
        update["email"] = body.email.lower()
    if body.phone is not None:
        update["phone"] = body.phone
    if body.role is not None:
        update["role"] = body.role
    if body.status is not None:
        update["status"] = body.status
    await db.users.update_one({"id": user_id}, {"$set": update})
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "passwordHash": 0})
    return strip_mongo(updated)


@router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(get_admin_user)):
    """Delete any user (donateur, user, admin). Archives all their listings and removes their applications."""
    if user_id == admin["id"]:
        raise HTTPException(400, "Je kan jezelf niet verwijderen")
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(404, "Gebruiker niet gevonden")
    await db.users.delete_one({"id": user_id})
    await db.listings.update_many(
        {"userId": user_id},
        {"$set": {"status": "gearchiveerd", "updatedAt": now_iso()}},
    )
    await db.applications.delete_many({"applicantUserId": user_id})
    return {"ok": True}


@router.get("/admin/organisations")
async def admin_list_organisations(q: str | None = Query(None), admin: dict = Depends(get_admin_user)):
    filt: dict = {}
    if q and len(q) >= 2:
        filt["name"] = {"$regex": q, "$options": "i"}
    orgs = await db.organisations.find(filt, {"_id": 0}).to_list(500)
    for org in orgs:
        org["userCount"] = await db.users.count_documents({"organisationId": org["id"]})
    return orgs


@router.patch("/admin/organisations/{org_id}")
async def admin_update_organisation(org_id: str, body: AdminOrgUpdate, admin: dict = Depends(get_admin_user)):
    existing = await db.organisations.find_one({"id": org_id})
    if not existing:
        raise HTTPException(404, "Organisatie niet gevonden")
    update = {"updatedAt": now_iso()}
    if body.name is not None:
        update["name"] = body.name
    if body.description is not None:
        update["description"] = body.description
    if body.category is not None:
        update["category"] = body.category
    if body.address is not None:
        update["address"] = body.address
    if body.website is not None:
        update["website"] = body.website
    if body.status is not None:
        update["status"] = body.status
    await db.organisations.update_one({"id": org_id}, {"$set": update})
    updated = await db.organisations.find_one({"id": org_id}, {"_id": 0})
    return strip_mongo(updated)


@router.delete("/admin/organisations/{org_id}")
async def admin_delete_organisation(org_id: str, admin: dict = Depends(get_admin_user)):
    existing = await db.organisations.find_one({"id": org_id})
    if not existing:
        raise HTTPException(404, "Organisatie niet gevonden")
    users = await db.users.find({"organisationId": org_id}, {"id": 1}).to_list(1000)
    user_ids = [u["id"] for u in users]
    if user_ids:
        await db.listings.update_many(
            {"userId": {"$in": user_ids}},
            {"$set": {"status": "gearchiveerd", "updatedAt": now_iso()}},
        )
    await db.users.delete_many({"organisationId": org_id})
    await db.organisations.delete_one({"id": org_id})
    return {"ok": True, "deletedUsers": len(user_ids)}


@router.post("/admin/maintenance/run")
async def admin_run_maintenance(admin: dict = Depends(get_admin_user)):
    archived = await archive_expired_listings(db)
    inactive = await mark_inactive_orgs(db)
    return {"archived": archived, "inactiveOrgs": inactive}


# --------------------------------------------------------------------------
# ADMIN STATS
# --------------------------------------------------------------------------
@router.get("/admin/stats/available-periods")
async def get_available_periods(admin: dict = Depends(get_admin_user)):
    pipeline = [
        {"$group": {"_id": {"$substr": ["$createdAt", 0, 4]}}},
        {"$project": {"year": "$_id", "_id": 0}},
    ]
    years: set[str] = set()
    for coll in [db.checkouts, db.platform_transfers, db.checkins]:
        async for doc in coll.aggregate(pipeline):
            if doc.get("year"):
                years.add(doc["year"])
    return {"years": sorted(years, reverse=True)}


@router.get("/admin/stats")
async def get_stats(
    year: int | None = Query(None),
    month: int | None = Query(None),
    admin: dict = Depends(get_admin_user),
):
    date_filter: dict = {}
    if year and month:
        last_day = calendar.monthrange(year, month)[1]
        start = f"{year}-{month:02d}-01"
        end = f"{year}-{month:02d}-{last_day:02d}T23:59:59"
        date_filter = {"createdAt": {"$gte": start, "$lte": end}}
    elif year:
        date_filter = {"createdAt": {"$gte": f"{year}-01-01", "$lte": f"{year}-12-31T23:59:59"}}

    match_stage = ({"$match": date_filter},) if date_filter else ()

    # --- Totals via aggregation (geen documenten in RAM) ---
    async def _sum(coll, field: str) -> float:
        pipeline = [*match_stage, {"$group": {"_id": None, "total": {"$sum": f"${field}"}, "count": {"$sum": 1}}}]
        result = await coll.aggregate(pipeline).to_list(1)
        return (round(result[0]["total"], 2), result[0]["count"]) if result else (0.0, 0)

    total_magazijn_kg, checkouts_count = await _sum(db.checkouts, "totalWeightKg")
    total_platform_kg, transfers_count = await _sum(db.platform_transfers, "weightKg")
    total_checkin_kg, checkins_count = await _sum(db.checkins, "totalWeightKg")

    # --- Materiaal per checkout-item (unwind items array) ---
    material_checkout_pipeline = [
        *match_stage,
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.material", "kg": {"$sum": "$items.weightKg"}}},
    ]
    material_stats: dict = {}
    async for doc in db.checkouts.aggregate(material_checkout_pipeline):
        material_stats.setdefault(doc["_id"], {"magazijn": 0, "platform": 0})
        material_stats[doc["_id"]]["magazijn"] = round(doc["kg"], 3)

    material_transfer_pipeline = [
        *match_stage,
        {"$group": {"_id": "$material", "kg": {"$sum": "$weightKg"}}},
    ]
    async for doc in db.platform_transfers.aggregate(material_transfer_pipeline):
        material_stats.setdefault(doc["_id"], {"magazijn": 0, "platform": 0})
        material_stats[doc["_id"]]["platform"] = round(doc["kg"], 3)

    # --- Per organisatie: magazijn ---
    org_magazijn_pipeline = [
        *match_stage,
        {"$group": {"_id": "$organisationId", "name": {"$first": "$organisationName"}, "kg": {"$sum": "$totalWeightKg"}}},
        {"$sort": {"kg": -1}},
    ]
    org_magazijn = [
        {"name": d["name"], "kg": round(d["kg"], 2)}
        async for d in db.checkouts.aggregate(org_magazijn_pipeline)
    ]

    # --- Per organisatie: platform ontvangen ---
    org_platform_pipeline = [
        *match_stage,
        {"$match": {"receiverOrganisationId": {"$exists": True, "$ne": None}}},
        {"$group": {"_id": "$receiverOrganisationId", "name": {"$first": "$receiverOrganisationName"}, "kg": {"$sum": "$weightKg"}}},
        {"$sort": {"kg": -1}},
    ]
    org_platform = [
        {"name": d.get("name") or "", "kg": round(d["kg"], 2)}
        async for d in db.platform_transfers.aggregate(org_platform_pipeline)
    ]

    # --- Per organisatie: platform gegeven ---
    org_givers_pipeline = [
        *match_stage,
        {"$addFields": {"_senderId": {"$ifNull": ["$senderOrganisationId", "$offererOrganisationId"]}}},
        {"$match": {"_senderId": {"$exists": True, "$ne": None}}},
        {"$group": {
            "_id": "$_senderId",
            "name": {"$first": {"$ifNull": ["$senderOrganisationName", None]}},
            "kg": {"$sum": "$weightKg"},
        }},
        {"$sort": {"kg": -1}},
    ]
    org_platform_givers_raw = await db.platform_transfers.aggregate(org_givers_pipeline).to_list(500)

    # Vul ontbrekende namen op via een batch lookup
    missing_ids = [d["_id"] for d in org_platform_givers_raw if not d.get("name")]
    name_map: dict = {}
    if missing_ids:
        async for org_doc in db.organisations.find({"id": {"$in": missing_ids}}, {"_id": 0, "id": 1, "name": 1}):
            name_map[org_doc["id"]] = org_doc["name"]

    org_platform_givers = [
        {"name": d.get("name") or name_map.get(d["_id"], ""), "kg": round(d["kg"], 2)}
        for d in org_platform_givers_raw
    ]

    # --- Per organisatie: checkins ---
    org_checkin_pipeline = [
        *match_stage,
        {"$match": {"organisationId": {"$exists": True, "$ne": None}}},
        {"$group": {"_id": "$organisationId", "name": {"$first": "$organisationName"}, "kg": {"$sum": "$totalWeightKg"}}},
        {"$sort": {"kg": -1}},
    ]
    org_checkin = [
        {"name": d.get("name") or "", "kg": round(d["kg"], 2)}
        async for d in db.checkins.aggregate(org_checkin_pipeline)
    ]

    return {
        "totals": {
            "magazijn_kg": total_magazijn_kg,
            "platform_kg": total_platform_kg,
            "checkin_kg": total_checkin_kg,
            "combined_kg": round(total_magazijn_kg + total_platform_kg, 2),
        },
        "by_material": material_stats,
        "by_org_magazijn": org_magazijn,
        "by_org_platform": org_platform,
        "by_org_platform_givers": org_platform_givers,
        "by_org_checkin": org_checkin,
        "checkouts_count": checkouts_count,
        "transfers_count": transfers_count,
        "checkins_count": checkins_count,
    }
