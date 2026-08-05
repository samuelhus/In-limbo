"""User profile + e-mail voorkeuren."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Depends, Response

from deps import db, now_iso, strip_mongo, anonymize_user, DEFAULT_EMAIL_PREFS
from models import UserUpdate, EmailPreferencesUpdate
from auth import hash_password, get_current_user, clear_auth_cookie

router = APIRouter()


@router.delete("/users/me")
async def delete_me(response: Response, user: dict = Depends(get_current_user)):
    """Zelf-verwijdering van je account (GDPR-recht op verwijdering).

    Anonimiseert je persoonsgegevens (zie deps.anonymize_user). Je
    aanbiedingen en aanvragen blijven bestaan zodat andere gebruikers en
    statistieken/impact-cijfers niet beïnvloed worden — enkel je naam wordt
    vervangen door 'Verwijderde gebruiker'.

    Ben je het enige lid van je organisatie, dan wordt die organisatie mee
    volledig verwijderd.
    """
    org_id = user.get("organisationId")

    await db.listings.update_many(
        {"userId": user["id"]},
        {"$set": {"status": "gearchiveerd", "updatedAt": now_iso()}},
    )

    org_also_deleted = False
    if org_id:
        remaining_members = await db.users.count_documents(
            {"organisationId": org_id, "id": {"$ne": user["id"]}}
        )
        if remaining_members == 0:
            await db.organisations.delete_one({"id": org_id})
            org_also_deleted = True

    await anonymize_user(db, user["id"])
    clear_auth_cookie(response)

    return {"ok": True, "organisationDeleted": org_also_deleted}


@router.patch("/users/me")
async def update_me(body: UserUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "password" in update:
        update["passwordHash"] = hash_password(update.pop("password"))
    if "email" in update:
        update["email"] = update["email"].lower()
        if await db.users.find_one({"email": update["email"], "id": {"$ne": user["id"]}}):
            raise HTTPException(409, "E-mailadres is al in gebruik")
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    fresh = await db.users.find_one({"id": user["id"]})
    return strip_mongo(fresh)


@router.get("/users/me/email-preferences")
async def get_email_prefs(user: dict = Depends(get_current_user)):
    prefs = (user or {}).get("emailPreferences") or {}
    return {**DEFAULT_EMAIL_PREFS, **prefs}


@router.patch("/users/me/email-preferences")
async def update_email_prefs(body: EmailPreferencesUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if update:
        current = (user or {}).get("emailPreferences") or {}
        merged = {**current, **update}
        await db.users.update_one({"id": user["id"]}, {"$set": {"emailPreferences": merged}})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "emailPreferences": 1})
    return {**DEFAULT_EMAIL_PREFS, **(fresh.get("emailPreferences") or {})}
