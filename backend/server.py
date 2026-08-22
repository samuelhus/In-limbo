"""In Limbo backend — FastAPI + MongoDB. Bootstrap file: setup, startup, mount routers."""
from __future__ import annotations
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

sentry_sdk.init(
    dsn=os.environ.get("SENTRY_DSN"),
    environment=os.environ.get("ENVIRONMENT", "development"),
    integrations=[StarletteIntegration(), FastApiIntegration()],
    traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.2")),
    send_default_pii=False,
)

import cloudinary
from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from pymongo.collation import Collation
from pymongo.errors import OperationFailure

from deps import db, client, log, limiter
from seed import seed
from tasks import (
    archive_expired_listings, mark_inactive_orgs, send_photo_reminders,
    send_message_email_reminders, report_upcoming_deadlines,
)
from notifications import backfill_mailerlite

scheduler = AsyncIOScheduler(timezone="Europe/Brussels")

# Route-modules
from routes.auth import router as auth_router
from routes.organisations import router as organisations_router
from routes.users import router as users_router
from routes.notifications import router as notifications_router
from routes.listings import router as listings_router
from routes.applications import router as applications_router
from routes.news import router as news_router
from routes.checkout import router as checkout_router
from routes.checkin import router as checkin_router
from routes.admin import router as admin_router
from routes.contact import router as contact_router
from routes.impact import router as impact_router
from routes.og import router as og_router
from routes.search_requests import router as search_requests_router
from routes.tags import router as tags_router
from routes.donateur import router as donateur_router
from routes.conversations import router as conversations_router
from routes.game import router as game_router
from routes.admin_game import router as admin_game_router


cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    secure=True,
)

app = FastAPI(title="In Limbo API")
api = APIRouter(prefix="/api")


# --------------------------------------------------------------------------
# Rate limiting (slowapi)
# --------------------------------------------------------------------------
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    path = request.url.path
    if path.endswith("/auth/login"):
        msg = "Te veel inlogpogingen. Probeer het over een minuut opnieuw."
    elif "/auth/register" in path:
        msg = "Te veel registratiepogingen. Probeer het over een minuut opnieuw."
    elif "/auth/forgot-password" in path:
        msg = "Te veel resetaanvragen. Probeer het over een minuut opnieuw."
    else:
        msg = "Te veel aanvragen. Probeer het later opnieuw."
    return JSONResponse(status_code=429, content={"detail": msg})


@api.get("/health")
async def health() -> dict:
    """Publieke, ongeauthenticeerde health-check voor uptime-monitoring (bv. cron + ntfy)."""
    return {"status": "ok"}


# --------------------------------------------------------------------------
# Startup / shutdown
# --------------------------------------------------------------------------
async def _nightly_maintenance() -> None:
    """Nachtelijke taak: archiveer verlopen listings, markeer inactieve orgs,
    en meld aanbiedingen waarvan de deadline binnen 7 dagen valt aan de
    admin-groep (PRD_meldingen_admin.md §6.2/§9 — zelfde cadans als de
    andere nachtelijke taken, geen aparte scheduler-registratie nodig)."""
    archived = await archive_expired_listings(db)
    inactive = await mark_inactive_orgs(db)
    deadline_reports = await report_upcoming_deadlines(db)
    log.info(
        f"Nachtelijke maintenance — archived={archived} inactive_orgs={inactive} "
        f"deadline_reports={deadline_reports}"
    )


async def _photo_reminder_job() -> None:
    """Dagelijkse taak om 13:12: herinner ontvangers om een resultaatfoto te sturen."""
    sent = await send_photo_reminders(db)
    log.info(f"Photo-reminder job — {sent} herinneringsmail(s) verstuurd")


async def _message_email_reminder_job() -> None:
    """Elke ~5 min: bundelmail voor gesprekken met een ongelezen-periode
    ouder dan 30 min (direct messaging fase 5, PRD §6.6)."""
    sent = await send_message_email_reminders(db)
    if sent:
        log.info(f"Message-email-reminder job — {sent} digestmail(s) verstuurd")


@app.on_event("startup")
async def startup() -> None:
    await db.users.create_index("email", unique=True)
    await db.users.create_index("organisationId")
    await db.users.create_index("username", unique=True, sparse=True)
    await db.users.create_index("role")  # admin queue: donateurs-filter
    await db.organisations.create_index("status")
    await db.listings.create_index("status")
    await db.listings.create_index("organisationId")
    await db.listings.create_index("deadline")
    await db.listings.create_index("userId")  # GET /listings/mine
    await db.listings.create_index([("status", 1), ("createdAt", -1)])  # catalogus sortering
    await db.applications.create_index("listingId")
    await db.applications.create_index("applicantUserId")
    await db.applications.create_index([("listingId", 1), ("applicantUserId", 1)])
    await db.applications.create_index([("listingId", 1), ("status", 1)])  # open-count aggregatie
    await db.conversations.create_index("applicationId", unique=True)  # 1-op-1 met Application
    await db.conversations.create_index("requesterUserId")
    await db.conversations.create_index("offererUnreadSince")  # e-maildigest-job (fase 5)
    await db.conversations.create_index("requesterUnreadSince")  # e-maildigest-job (fase 5)
    await db.messages.create_index([("conversationId", 1), ("createdAt", 1)])  # paginatie/chatvolgorde
    await db.notifications.create_index("userId")  # notificaties per gebruiker
    await db.notifications.create_index([("userId", 1), ("read", 1)])  # ongelezen badge
    await db.notifications.create_index("createdAt")  # purge oude notificaties
    await db.platform_transfers.create_index("offererOrganisationId")  # jaarverslag
    await db.platform_transfers.create_index("receiverOrganisationId")  # jaarverslag
    await db.platform_transfers.create_index("createdAt")  # admin stats datumfilter
    await db.checkins.create_index("organisationId")  # jaarverslag
    await db.checkins.create_index("createdAt")  # admin stats datumfilter
    await db.checkouts.create_index("organisationId")
    await db.checkouts.create_index("createdAt")  # admin stats datumfilter
    await db.photo_reminders.create_index([("txType", 1), ("txId", 1)])
    await db.photo_reminders.create_index([("organisationId", 1), ("monthKey", 1)])
    await db.password_resets.create_index("token", unique=True)
    await db.password_resets.create_index("expiresAt", expireAfterSeconds=0)
    await db.newsletter_subscribers.create_index("email", unique=True)
    await db.contact_messages.create_index("createdAt")
    # Meldingen (zie prd/PRD_meldingen_admin.md) — team-overzicht van
    # platformgebeurtenissen, los van db.notifications hierboven.
    await db.reports.create_index("status")  # open-count-badge + standaardfilter
    await db.reports.create_index("createdAt")  # nieuwste eerst
    await db.reports.create_index([("type", 1), ("targetId", 1)])  # idempotentiechecks per trigger
    # Schat of Schroot? (swipe-spel, zie prd/PRD_Schat_of_Schroot.md) — losstaand
    # subsysteem, eigen collecties (routes/game.py, routes/admin_game.py).
    # partialFilterExpression sluit username=None uit van de uniciteitscontrole
    # — anonymize_game_user (deps.py) zet username op None bij een GDPR-
    # verwijdering, en zonder deze partial filter mocht dat maar bij hoogstens
    # 1 speler tegelijk: een 2de verwijdering botste dan op een duplicate-key-
    # fout (500) op deze index, bv. via DELETE /admin/game/users/{id}.
    try:
        await db.game_users.create_index(
            "username", unique=True, collation=Collation(locale="en", strength=2),
            partialFilterExpression={"username": {"$type": "string"}},
        )  # case-insensitieve uniciteit (PRD §3)
    except OperationFailure:
        # Bestaande index van vóór de partialFilterExpression hierboven — heeft
        # dezelfde naam/keys maar andere opties, wat MongoDB niet toestaat te
        # wijzigen via create_index. Eenmalig droppen en opnieuw aanmaken lost
        # dit definitief op; onschadelijk om te herhalen (idempotent).
        await db.game_users.drop_index("username_1")
        await db.game_users.create_index(
            "username", unique=True, collation=Collation(locale="en", strength=2),
            partialFilterExpression={"username": {"$type": "string"}},
        )
    await db.game_users.create_index("email")  # niet uniek — meerdere usernames per email toegestaan
    await db.game_interactions.create_index(
        [("userId", 1), ("listingId", 1)], unique=True,
    )  # max 1 interactie (reject/evaluate) per speler per listing
    await db.game_evaluations.create_index("listingId")
    await db.game_evaluations.create_index("userId")
    await db.game_evaluations.create_index([("listingId", 1), ("votes", -1)])  # top-evaluatie per listing
    await db.game_evaluations.create_index("createdAt")  # maandelijkse leaderboard-filter
    await seed(db)

    # Eenmalige run bij opstart (vangt listings die verlopen zijn tijdens downtime)
    archived = await archive_expired_listings(db)
    inactive = await mark_inactive_orgs(db)
    deadline_reports = await report_upcoming_deadlines(db)
    log.info(f"Startup OK — archived={archived} inactive_orgs={inactive} deadline_reports={deadline_reports}")

    # MailerLite-inhaalslag: no-op als MAILERLITE_API_KEY niet is ingesteld. Zodra
    # de key wél ingesteld wordt, haalt de eerstvolgende herstart automatisch alle
    # nog niet-gesynchroniseerde nieuwsbrief-abonnees en gebruikers in.
    mailerlite_result = await backfill_mailerlite(db)
    if not mailerlite_result.get("skipped"):
        log.info(
            "MailerLite-inhaalslag: %s nieuwsbrief-abonnees, %s gebruikers gesynchroniseerd",
            mailerlite_result.get("newsletter_synced", 0),
            mailerlite_result.get("users_synced", 0),
        )

    # Nachtelijke scheduler: elke dag om 02:00 Brusselse tijd
    scheduler.add_job(_nightly_maintenance, CronTrigger(hour=2, minute=0))
    # Foto-herinneringsmails: elke dag om 13:12 Brusselse tijd
    scheduler.add_job(_photo_reminder_job, CronTrigger(hour=13, minute=12))
    # Bericht-e-maildigest: elke ~5 min (direct messaging fase 5, PRD §6.6)
    scheduler.add_job(_message_email_reminder_job, IntervalTrigger(minutes=5))
    scheduler.start()
    log.info(
        "Scheduler gestart — nachtelijke maintenance om 02:00, foto-herinneringen om 13:12, "
        "bericht-e-maildigest elke 5 min"
    )


@app.on_event("shutdown")
async def shutdown() -> None:
    scheduler.shutdown(wait=False)
    client.close()


# --------------------------------------------------------------------------
# Health
# --------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"app": "In Limbo", "ok": True}


# --------------------------------------------------------------------------
# Mount routers
# --------------------------------------------------------------------------
api.include_router(auth_router)
api.include_router(organisations_router)
api.include_router(users_router)
api.include_router(notifications_router)
api.include_router(listings_router)
api.include_router(applications_router)
api.include_router(news_router)
api.include_router(checkout_router)
api.include_router(checkin_router)
api.include_router(admin_router)
api.include_router(contact_router)
api.include_router(impact_router)
api.include_router(og_router)
api.include_router(search_requests_router)
api.include_router(tags_router)
api.include_router(donateur_router)
api.include_router(conversations_router)
api.include_router(game_router)
api.include_router(admin_game_router)

app.include_router(api)

# --------------------------------------------------------------------------
# CORS
# --------------------------------------------------------------------------
frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
