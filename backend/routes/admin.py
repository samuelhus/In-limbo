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
async def admin_list_users(q: str | None = Query(None), admin: dict = Depends(get_admin_user)):
    filt: dict = {}
    if q and len(q) >= 2:
        regex = {"$regex": q, "$options": "i"}
        filt["$or"] = [
            {"firstName": regex}, {"lastName": regex},
            {"username": regex}, {"email": regex},
        ]
    users = await db.users.find(filt, {"_id": 0, "passwordHash": 0}).to_list(500)
    org_ids = [u["organisationId"] for u in users if u.get("organisationId")]
    orgs: dict = {}
    if org_ids:
        async for o in db.organisations.find({"id": {"$in": org_ids}}, {"_id": 0, "id": 1, "name": 1}):
            orgs[o["id"]] = o["name"]
    for u in users:
        u["organisationName"] = orgs.get(u.get("organisationId"))
    return users


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
    users = await db.users.find({"organisationId": org_id}, {"id": 1}).to_list(None)
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
    checkouts = await db.checkouts.find({}, {"createdAt": 1}).to_list(None)
    transfers = await db.platform_transfers.find({}, {"createdAt": 1}).to_list(None)
    checkins = await db.checkins.find({}, {"createdAt": 1}).to_list(None)
    years = set()
    for doc in checkouts + transfers + checkins:
        if doc.get("createdAt"):
            years.add(doc["createdAt"][:4])
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

    checkouts = await db.checkouts.find(date_filter).to_list(None)
    transfers = await db.platform_transfers.find(date_filter).to_list(None)
    checkins = await db.checkins.find(date_filter).to_list(None)

    total_magazijn_kg = round(sum(c["totalWeightKg"] for c in checkouts), 2)
    total_platform_kg = round(sum(t["weightKg"] for t in transfers), 2)
    total_checkin_kg = round(sum(c["totalWeightKg"] for c in checkins), 2)

    material_stats: dict = {}
    for c in checkouts:
        for item in c["items"]:
            m = item["material"]
            material_stats.setdefault(m, {"magazijn": 0, "platform": 0})
            material_stats[m]["magazijn"] = round(material_stats[m]["magazijn"] + item["weightKg"], 3)
    for t in transfers:
        m = t["material"]
        material_stats.setdefault(m, {"magazijn": 0, "platform": 0})
        material_stats[m]["platform"] = round(material_stats[m]["platform"] + t["weightKg"], 3)

    org_magazijn: dict = {}
    for c in checkouts:
        oid = c["organisationId"]
        org_magazijn.setdefault(oid, {"name": c["organisationName"], "kg": 0})
        org_magazijn[oid]["kg"] = round(org_magazijn[oid]["kg"] + c["totalWeightKg"], 2)

    org_platform: dict = {}
    for t in transfers:
        if not t.get("receiverOrganisationId"):
            continue
        oid = t["receiverOrganisationId"]
        org_platform.setdefault(oid, {"name": t.get("receiverOrganisationName") or "", "kg": 0})
        org_platform[oid]["kg"] = round(org_platform[oid]["kg"] + t["weightKg"], 2)

    org_platform_givers: dict = {}
    sender_name_cache: dict = {}
    for t in transfers:
        sender_oid = t.get("senderOrganisationId") or t.get("offererOrganisationId")
        if not sender_oid:
            continue
        sender_name = t.get("senderOrganisationName")
        if not sender_name:
            if sender_oid in sender_name_cache:
                sender_name = sender_name_cache[sender_oid]
            else:
                org_doc = await db.organisations.find_one({"id": sender_oid}, {"_id": 0, "name": 1})
                sender_name = org_doc["name"] if org_doc else ""
                sender_name_cache[sender_oid] = sender_name
        org_platform_givers.setdefault(sender_oid, {"name": sender_name, "kg": 0})
        org_platform_givers[sender_oid]["kg"] = round(org_platform_givers[sender_oid]["kg"] + t["weightKg"], 2)

    org_checkin: dict = {}
    for c in checkins:
        if not c.get("organisationId"):
            continue
        oid = c["organisationId"]
        org_checkin.setdefault(oid, {"name": c.get("organisationName") or "", "kg": 0})
        org_checkin[oid]["kg"] = round(org_checkin[oid]["kg"] + c["totalWeightKg"], 2)

    return {
        "totals": {
            "magazijn_kg": total_magazijn_kg,
            "platform_kg": total_platform_kg,
            "checkin_kg": total_checkin_kg,
            "combined_kg": round(total_magazijn_kg + total_platform_kg, 2),
        },
        "by_material": material_stats,
        "by_org_magazijn": sorted(org_magazijn.values(), key=lambda x: x["kg"], reverse=True),
        "by_org_platform": sorted(org_platform.values(), key=lambda x: x["kg"], reverse=True),
        "by_org_platform_givers": sorted(org_platform_givers.values(), key=lambda x: x["kg"], reverse=True),
        "by_org_checkin": sorted(org_checkin.values(), key=lambda x: x["kg"], reverse=True),
        "checkouts_count": len(checkouts),
        "transfers_count": len(transfers),
        "checkins_count": len(checkins),
    }
