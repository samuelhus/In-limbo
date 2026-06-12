"""Auth endpoints: registratie, login, logout, current user, password reset."""
import secrets
import uuid
import asyncio
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Depends, Response, Request, Body
from slowapi.util import get_remote_address

from deps import db, now_iso, strip_mongo, limiter
from models import (
    RegisterNewOrg, RegisterExistingOrg, RegisterDonateur, LoginRequest,
    PasswordResetRequest, PasswordResetConfirm,
)
from auth import (
    hash_password, verify_password, create_access_token,
    set_auth_cookie, clear_auth_cookie, get_current_user,
)
from notifications import (
    notify_admins_new_registration, send_email, render_email, FRONTEND_URL,
)

router = APIRouter()


RATE_LIMIT_MSG = "Te veel inlogpogingen. Probeer het over een minuut opnieuw."


def get_lang(request: Request) -> str:
    lang = request.headers.get("Accept-Language", "nl")
    if lang.startswith("fr"):
        return "fr"
    return "nl"


MESSAGES = {
    "terms_required": {
        "nl": "Je moet de voorwaarden aanvaarden",
        "fr": "Vous devez accepter les conditions",
    },
    "email_exists": {
        "nl": "Dit e-mailadres is al geregistreerd",
        "fr": "Cette adresse e-mail est déjà enregistrée",
    },
    "username_exists": {
        "nl": "Deze gebruikersnaam is al in gebruik",
        "fr": "Ce nom d'utilisateur est déjà utilisé",
    },
    "org_not_found": {
        "nl": "Organisatie niet gevonden of niet gevalideerd",
        "fr": "Organisation introuvable ou non validée",
    },
    "login_failed": {
        "nl": "Onjuist e-mailadres of wachtwoord",
        "fr": "Adresse e-mail ou mot de passe incorrect",
    },
    "reset_invalid": {
        "nl": "Ongeldige of verlopen resetlink.",
        "fr": "Lien de réinitialisation invalide ou expiré.",
    },
    "reset_expired": {
        "nl": "Deze resetlink is verlopen. Vraag een nieuwe aan.",
        "fr": "Ce lien de réinitialisation a expiré. Veuillez en demander un nouveau.",
    },
}


def msg(key: str, request: Request) -> str:
    return MESSAGES[key][get_lang(request)]


@router.post("/auth/register/new-org")
@limiter.limit("10/minute")
async def register_new_org(request: Request, body: RegisterNewOrg = Body(...), response: Response = None):
    if not body.acceptedTerms:
        raise HTTPException(status_code=400, detail=msg("terms_required", request))

    email = body.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail=msg("email_exists", request))

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
@limiter.limit("10/minute")
async def register_existing_org(request: Request, body: RegisterExistingOrg = Body(...), response: Response = None):
    if not body.acceptedTerms:
        raise HTTPException(status_code=400, detail=msg("terms_required", request))

    email = body.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail=msg("email_exists", request))

    org = await db.organisations.find_one({"id": body.organisationId})
    if not org or org["status"] not in ("validated", "active"):
        raise HTTPException(status_code=404, detail=msg("org_not_found", request))

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
@limiter.limit("10/minute")
async def register_donateur(request: Request, body: RegisterDonateur = Body(...), response: Response = None):
    if not body.acceptedTerms:
        raise HTTPException(400, msg("terms_required", request))
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, msg("email_exists", request))
    if await db.users.find_one({"username": body.username}):
        raise HTTPException(409, msg("username_exists", request))
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
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest = Body(...), response: Response = None):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["passwordHash"]):
        raise HTTPException(status_code=401, detail=msg("login_failed", request))

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



# --------------------------------------------------------------------------
# Wachtwoord vergeten / reset
# --------------------------------------------------------------------------
SAFE_FORGOT_RESPONSE = {
    "ok": True,
    "message": "Als dit e-mailadres bestaat, sturen we een resetlink.",
}


@router.post("/auth/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(request: Request, body: PasswordResetRequest = Body(...)):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user:
        return SAFE_FORGOT_RESPONSE

    # Oude tokens van deze user opruimen (single active token per user)
    await db.password_resets.delete_many({"userId": user["id"]})

    token = secrets.token_urlsafe(32)
    now = now_iso()
    expires_dt = datetime.now(timezone.utc) + timedelta(hours=24)

    await db.password_resets.insert_one({
        "token": token,
        "userId": user["id"],
        "email": email,
        "createdAt": now,
        "expiresAt": expires_dt,
        "expiresAtIso": expires_dt.isoformat(),
        "used": False,
    })

    reset_url = f"{FRONTEND_URL}/wachtwoord-reset?token={token}"
    first = user.get("firstName") or user.get("username") or "daar"
    html = render_email(
        title="Wachtwoord opnieuw instellen",
        body_lines=[
            f"Dag {first},",
            "Je hebt gevraagd om je wachtwoord opnieuw in te stellen.",
            "Klik op onderstaande knop om een nieuw wachtwoord in te stellen. De link is 24 uur geldig.",
            "Als je dit niet zelf hebt aangevraagd, kan je deze e-mail negeren.",
        ],
        cta_text="Stel nieuw wachtwoord in →",
        cta_url=reset_url,
    )
    asyncio.create_task(send_email(
        to_email=email,
        subject="Wachtwoord opnieuw instellen — In Limbo",
        html_content=html,
    ))
    return SAFE_FORGOT_RESPONSE


@router.post("/auth/reset-password")
@limiter.limit("10/minute")
async def reset_password(request: Request, body: PasswordResetConfirm = Body(...)):
    record = await db.password_resets.find_one({"token": body.token, "used": False})
    if not record:
        raise HTTPException(400, msg("reset_invalid", request))

    expires_at = record.get("expiresAt")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    elif expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at is None or datetime.now(timezone.utc) > expires_at:
        await db.password_resets.delete_one({"token": body.token})
        raise HTTPException(400, msg("reset_expired", request))

    new_hash = hash_password(body.newPassword)
    await db.users.update_one(
        {"id": record["userId"]},
        {"$set": {"passwordHash": new_hash, "updatedAt": now_iso()}},
    )

    # Single-use: token verwijderen na succes
    await db.password_resets.delete_one({"token": body.token})

    user = await db.users.find_one({"id": record["userId"]})
    if user:
        first = user.get("firstName") or user.get("username") or "daar"
        html = render_email(
            title="Wachtwoord gewijzigd",
            body_lines=[
                f"Dag {first},",
                "Je wachtwoord is succesvol gewijzigd.",
                "Als je dit niet zelf hebt gedaan, neem dan onmiddellijk contact op via hello@inlimbo.be.",
            ],
            cta_text="Inloggen →",
            cta_url=f"{FRONTEND_URL}/login",
        )
        asyncio.create_task(send_email(
            to_email=user["email"],
            subject="Je wachtwoord is gewijzigd — In Limbo",
            html_content=html,
        ))

    return {"ok": True, "message": "Wachtwoord succesvol gewijzigd."}
