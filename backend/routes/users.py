"""User profile + e-mail voorkeuren."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Depends

from deps import db, strip_mongo, DEFAULT_EMAIL_PREFS
from models import UserUpdate, EmailPreferencesUpdate
from auth import hash_password, get_current_user

router = APIRouter()


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
