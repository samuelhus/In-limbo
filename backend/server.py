"""In Limbo backend — FastAPI + MongoDB. Bootstrap file: setup, startup, mount routers."""
from __future__ import annotations
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os

import cloudinary
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from deps import db, client, log
from seed import seed
from tasks import archive_expired_listings, mark_inactive_orgs

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


cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    secure=True,
)

app = FastAPI(title="In Limbo API")
api = APIRouter(prefix="/api")


# --------------------------------------------------------------------------
# Startup / shutdown
# --------------------------------------------------------------------------
@app.on_event("startup")
async def startup() -> None:
    await db.users.create_index("email", unique=True)
    await db.users.create_index("organisationId")
    await db.users.create_index("username", unique=True, sparse=True)
    await db.organisations.create_index("status")
    await db.listings.create_index("status")
    await db.listings.create_index("organisationId")
    await db.listings.create_index("deadline")
    await db.applications.create_index("listingId")
    await db.applications.create_index("applicantUserId")
    await db.applications.create_index([("listingId", 1), ("applicantUserId", 1)])
    await seed(db)
    archived = await archive_expired_listings(db)
    inactive = await mark_inactive_orgs(db)
    log.info(f"Startup OK — archived={archived} inactive_orgs={inactive}")


@app.on_event("shutdown")
async def shutdown() -> None:
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
