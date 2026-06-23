"""Applications: aanvraag indienen, intrekken, beheren, selecteren, unrehome, mark-rehomed."""
from __future__ import annotations
import uuid

from fastapi import APIRouter, HTTPException, Depends

from deps import db, now_iso, strip_mongo
from models import ApplicationCreate, SelectApplicantBody
from auth import get_validated_user, get_donateur_or_validated_user
from notifications import (
    create_notification, maybe_send_email, render_email, FRONTEND_URL,
)
from routes.listings import _require_listing_owner_or_admin

router = APIRouter()


@router.post("/listings/{listing_id}/apply")
async def apply_to_listing(
    listing_id: str, body: ApplicationCreate, user: dict = Depends(get_validated_user),
):
    if user.get("role") == "donateur":
        raise HTTPException(403, "Donateurs kunnen geen aanvragen indienen")
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

    offerer = await db.users.find_one({"id": listing["userId"]})
    applicant_org_name = None
    if user.get("organisationId"):
        ao = await db.organisations.find_one({"id": user["organisationId"]}, {"_id": 0, "name": 1})
        applicant_org_name = ao["name"] if ao else None
    applicant_name = applicant_org_name or user.get("username") or f'{user.get("firstName","")} {user.get("lastName","")}'.strip()
    msg = f'{applicant_name} heeft een aanvraag gedaan voor "{listing.get("title","")}"'
    await create_notification(db, listing["userId"], "new_application", msg, listing_id, listing.get("title"))
    cta_url = f"{FRONTEND_URL}/aanbieding/{listing_id}"
    html = render_email(
        "Nieuwe aanvraag op je aanbieding",
        [msg + ".", "Bekijk de motivatie en beslis wie de ontvanger wordt."],
        cta_text="Bekijk aanvraag →", cta_url=cta_url,
    )
    if offerer:
        await maybe_send_email(db, offerer["id"], "new_application", offerer.get("email"),
                               "Nieuwe aanvraag op je aanbieding", html)
    return strip_mongo(app_doc)


@router.post("/applications/{application_id}/withdraw")
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
        listing = await db.listings.find_one({"id": listing_id})
        offerer = await db.users.find_one({"id": listing["userId"]}) if listing else None
        if offerer:
            applicant_name = user.get("firstName") or user.get("username") or "Een aanvrager"
            msg = f'{applicant_name} heeft zijn aanvraag ingetrokken voor "{listing.get("title","")}". Je kan een nieuwe ontvanger aanduiden.'
            await create_notification(db, offerer["id"], "application_withdrawn", msg, listing_id, listing.get("title"))
            html = render_email(
                "Aanvraag ingetrokken — kies een nieuwe ontvanger",
                [msg, "De aanbieding staat opnieuw open en eerdere openstaande aanvragen zijn heropend."],
                cta_text="Bekijk aanbieding →", cta_url=f"{FRONTEND_URL}/aanbieding/{listing_id}",
            )
            await maybe_send_email(db, offerer["id"], "application_withdrawn", offerer.get("email"),
                                   "Aanvraag ingetrokken — kies een nieuwe ontvanger", html)
    return {"ok": True}


@router.get("/applications/mine")
async def my_applications(user: dict = Depends(get_validated_user)):
    cursor = db.applications.find({"applicantUserId": user["id"]}).sort("createdAt", -1)
    apps = [strip_mongo(a) async for a in cursor]
    if not apps:
        return []
    listing_ids = list({a["listingId"] for a in apps})
    listings_map: dict[str, dict] = {}
    async for lst in db.listings.find({"id": {"$in": listing_ids}}):
        listings_map[lst["id"]] = strip_mongo(lst)
    org_ids = list({lst["organisationId"] for lst in listings_map.values()})
    orgs_map: dict[str, dict] = {}
    async for o in db.organisations.find({"id": {"$in": org_ids}}, {"_id": 0, "id": 1, "name": 1}):
        orgs_map[o["id"]] = o
    for a in apps:
        lst = listings_map.get(a["listingId"])
        if lst:
            a["listing"] = {
                "id": lst["id"],
                "title": lst["title"],
                "photo": (lst.get("photos") or [None])[0],
                "status": lst["status"],
                "organisationId": lst["organisationId"],
                "organisationName": (orgs_map.get(lst["organisationId"]) or {}).get("name"),
            }
    return apps


@router.get("/listings/{listing_id}/applications")
async def list_listing_applications(listing_id: str, user: dict = Depends(get_donateur_or_validated_user)):
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

    out = []
    for a in apps:
        u = users_map.get(a["applicantUserId"]) or {}
        o = orgs_map.get(a["applicantOrganisationId"]) or {}
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
        # De aanbieder mag de contactgegevens van een aanvrager al zien zodra
        # die aanvraag is gedaan (status "open"), niet pas na selectie.
        # Voor afgewezen aanvragen ("not_selected") tonen we ze niet meer.
        if a["status"] in ("open", "selected"):
            entry["applicant"]["email"] = u.get("email")
            entry["applicant"]["phone"] = u.get("phone")
        out.append(entry)
    return out


@router.post("/listings/{listing_id}/select-applicant")
async def select_applicant(
    listing_id: str, body: SelectApplicantBody, user: dict = Depends(get_donateur_or_validated_user),
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
    await db.applications.update_one(
        {"id": body.applicationId},
        {"$set": {"status": "selected", "updatedAt": now}},
    )
    await db.applications.update_many(
        {"listingId": listing_id, "status": "open", "id": {"$ne": body.applicationId}},
        {"$set": {"status": "not_selected", "updatedAt": now}},
    )
    await db.listings.update_one(
        {"id": listing_id},
        {"$set": {"status": "herbestemd", "selectedApplicantId": body.applicationId, "updatedAt": now}},
    )

    if listing.get("weight") and listing.get("material"):
        receiver_user = await db.users.find_one({"id": app_doc["applicantUserId"]})
        receiver_org_id = receiver_user.get("organisationId") if receiver_user else None
        receiver_org = await db.organisations.find_one({"id": receiver_org_id}) if receiver_org_id else None
        sender_org_id = listing.get("organisationId")
        sender_org = await db.organisations.find_one({"id": sender_org_id}) if sender_org_id else None
        transfer_doc = {
            "id": str(uuid.uuid4()),
            "listingId": listing_id,
            "listingTitle": listing.get("title", ""),
            "material": listing["material"],
            "weightKg": float(listing["weight"]),
            "offererOrganisationId": sender_org_id,
            "senderOrganisationId": sender_org_id,
            "senderOrganisationName": sender_org["name"] if sender_org else None,
            "receiverOrganisationId": receiver_org_id,
            "receiverOrganisationName": receiver_org["name"] if receiver_org else None,
            "type": "platform",
            "createdAt": now,
        }
        await db.platform_transfers.insert_one(transfer_doc)

    receiver = await db.users.find_one({"id": app_doc["applicantUserId"]})
    if receiver:
        msg = f'Je bent aangeduid als ontvanger van "{listing.get("title","")}". Bekijk de contactgegevens van de aanbieder.'
        await create_notification(db, receiver["id"], "selected_as_receiver", msg, listing_id, listing.get("title"))
        html = render_email(
            "Je bent geselecteerd als ontvanger",
            [msg, "Spreek af met de aanbieder en haal het materiaal op."],
            cta_text="Bekijk aanbieding →", cta_url=f"{FRONTEND_URL}/aanbieding/{listing_id}",
        )
        await maybe_send_email(db, receiver["id"], "selected_as_receiver", receiver.get("email"),
                               "Je bent geselecteerd als ontvanger", html)
    return {"ok": True}


async def _reset_listing_to_available(listing_id: str) -> None:
    """Reset herbestemde listing back to beschikbaar + reopen selected/not_selected applications."""
    now = now_iso()
    await db.applications.update_many(
        {"listingId": listing_id, "status": {"$in": ["selected", "not_selected"]}},
        {"$set": {"status": "open", "updatedAt": now}},
    )
    await db.listings.update_one(
        {"id": listing_id},
        {"$set": {"status": "beschikbaar", "selectedApplicantId": None, "updatedAt": now}},
    )


@router.post("/listings/{listing_id}/unrehome")
async def unrehome(listing_id: str, user: dict = Depends(get_donateur_or_validated_user)):
    listing = await _require_listing_owner_or_admin(listing_id, user)
    if listing["status"] != "herbestemd":
        raise HTTPException(400, "Deze aanbieding is niet herbestemd")
    selected_id = listing.get("selectedApplicantId")
    await _reset_listing_to_available(listing_id)
    if selected_id:
        app_doc = await db.applications.find_one({"id": selected_id})
        if app_doc:
            receiver = await db.users.find_one({"id": app_doc["applicantUserId"]})
            if receiver:
                msg = f'De aanbieding "{listing.get("title","")}" is terug beschikbaar. Je aanvraag is opnieuw open.'
                await create_notification(db, receiver["id"], "unrehomed", msg, listing_id, listing.get("title"))
                html = render_email(
                    "Aanbieding terug beschikbaar",
                    [msg, "Je staat opnieuw in de wachtrij voor deze aanbieding."],
                    cta_text="Bekijk aanbieding →", cta_url=f"{FRONTEND_URL}/aanbieding/{listing_id}",
                )
                await maybe_send_email(db, receiver["id"], "unrehomed", receiver.get("email"),
                                       "Aanbieding terug beschikbaar", html)
    return {"ok": True}


@router.post("/listings/{listing_id}/unselect")
async def unselect_applicant(listing_id: str, user: dict = Depends(get_donateur_or_validated_user)):
    """Backwards-compat alias for older clients — delegates to unrehome."""
    return await unrehome(listing_id, user)


@router.post("/listings/{listing_id}/mark-rehomed")
async def mark_rehomed(listing_id: str, user: dict = Depends(get_donateur_or_validated_user)):
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
