"""Public contact form + newsletter subscription endpoints."""

import asyncio
import uuid
from fastapi import APIRouter, Body, Request

from deps import db, now_iso, limiter
from models import ContactMessageCreate, NewsletterSubscribeCreate
from notifications import notify_admins_contact_message, sync_to_mailerlite

router = APIRouter()


@router.post("/contact")
@limiter.limit("5/minute")
async def submit_contact(request: Request, body: ContactMessageCreate = Body(...)):
    """Store a contact-form submission and email the In Limbo admins."""
    doc = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "email": body.email.lower(),
        "message": body.message,
        "createdAt": now_iso(),
    }
    await db.contact_messages.insert_one(doc)
    asyncio.create_task(notify_admins_contact_message(
        db=db, name=body.name, email=body.email.lower(), message=body.message,
    ))
    return {"ok": True}


@router.post("/newsletter/subscribe")
@limiter.limit("5/minute")
async def newsletter_subscribe(request: Request, body: NewsletterSubscribeCreate = Body(...)):
    """Idempotent newsletter signup. Stores locally, attempts MailerLite sync if configured."""
    email = body.email.lower()
    synced = await sync_to_mailerlite(email)
    await db.newsletter_subscribers.update_one(
        {"email": email},
        {
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "email": email,
                "createdAt": now_iso(),
            },
            "$set": {"mailerliteSynced": bool(synced)},
        },
        upsert=True,
    )
    return {"ok": True}
