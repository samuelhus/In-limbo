"""In Limbo backend — FastAPI + MongoDB. Bootstrap file: setup, startup, mount routers."""
from __future__ import annotations
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os

import cloudinary
from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from deps import db, client, log, limiter
from seed import seed
from tasks import archive_expired_listings, mark_inactive_orgs
from search_keywords import run_keyword_enrichment
from apscheduler.schedulers.asyncio import AsyncIOScheduler

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


# --------------------------------------------------------------------------
# Startup / shutdown
# --------------------------------------------------------------------------


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
    await db.password_resets.create_index("token", unique=True)
    await db.password_resets.create_index("expiresAt", expireAfterSeconds=0)
    await db.newsletter_subscribers.create_index("email", unique=True)
    await db.contact_messages.create_index("createdAt")

    # Bilingual search: text index on title + description + material + searchKeywords.
    # MongoDB allows only one text index per collection — drop any existing one first.
    try:
        existing = await db.listings.index_information()
        for name, info in existing.items():
            if any(field[1] == "text" for field in info.get("key", [])):
                try:
                    await db.listings.drop_index(name)
                except Exception as drop_err:
                    log.warning(f"Could not drop existing text index {name}: {drop_err}")
        await db.listings.create_index(
            [
                ("title", "text"),
                ("description", "text"),
                ("material", "text"),
                ("searchKeywords", "text"),
            ],
            default_language="none",
            name="listings_search_idx",
        )
    except Exception as e:
        log.warning(f"Listings text index setup skipped: {e}")

    await seed(db)

    # Eenmalige run bij opstart (vangt listings die verlopen zijn tijdens downtime)
    archived = await archive_expired_listings(db)
    inactive = await mark_inactive_orgs(db)
    log.info(f"Startup OK — archived={archived} inactive_orgs={inactive}")

    # APScheduler: nightly maintenance jobs. Wrap in try/except so any scheduler
    # failure never blocks the app from starting.
    try:
        scheduler = AsyncIOScheduler(timezone="Europe/Brussels")
        scheduler.add_job(archive_expired_listings, "cron", hour=3, minute=0, args=[db])
        scheduler.add_job(mark_inactive_orgs, "cron", hour=3, minute=10, args=[db])
        scheduler.add_job(run_keyword_enrichment, "cron", hour=3, minute=20, args=[db])
        scheduler.start()
        app.state.scheduler = scheduler
        log.info("APScheduler started — archive/inactive/enrichment jobs scheduled")
    except Exception as e:
        log.warning(f"APScheduler startup skipped: {e}")


@app.on_event("shutdown")
async def shutdown() -> None:
    scheduler = getattr(app.state, "scheduler", None)
    if scheduler is not None:
        try:
            scheduler.shutdown()
        except Exception as e:
            log.warning(f"Scheduler shutdown failed: {e}")
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

app.include_router(api)

# --------------------------------------------------------------------------
# CORS
# --------------------------------------------------------------------------
frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
env = os.environ.get("ENV", "development")

allowed_origins = [frontend_url]
if env != "production":
    allowed_origins.append("http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
