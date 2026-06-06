"""Auth endpoints: registratie, login, logout, current user."""
from __future__ import annotations
import uuid
import asyncio

from fastapi import APIRouter, HTTPException, Depends, Response

from deps import db, now_iso, strip_mongo
from models import RegisterNewOrg, RegisterExistingOrg, RegisterDonateur, LoginRequest
from auth import (
    hash_password, verify_password, create_access_token,
    set_auth_cookie, clear_auth_cookie, get_current_user,
)
from notifications import notify_admins_new_registration

router = APIRouter()


@router.post("/auth/register/new-org")
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
    asyncio.create_task(notify_admins_new_registration(
        db=db,
        new_user_firstName=body.firstName,
        new_user_lastName=body.lastName,
        new_user_email=email,
        org_name=body.orgName,
        registration_type="new-org",
    ))
    return {"ok": True, "userId": user_id, "organisationId": org_id, "status": "pending"}


@router.post("/auth/register/existing-org")
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
    asyncio.create_task(notify_admins_new_registration(
        db=db,
        new_user_firstName=body.firstName,
        new_user_lastName=body.lastName,
        new_user_email=email,
        org_name=org["name"],
        registration_type="existing-org",
    ))
    return {"ok": True, "userId": user_id, "status": "pending"}


@router.post("/auth/register/donateur")
async def register_donateur(body: RegisterDonateur, response: Response):
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
        "role": "donateur",
        "status": "validated",
        "rejectionReason": None,
        "organisationId": None,
        "dateLastLogin": None,
        "createdAt": now,
    })
    token = create_access_token(user_id, email, "donateur")
    set_auth_cookie(response, token)
    return {"ok": True, "userId": user_id, "status": "validated"}


@router.post("/auth/login")
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


@router.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return strip_mongo(dict(user))
