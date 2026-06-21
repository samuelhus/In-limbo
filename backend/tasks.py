"""Background-ish maintenance tasks: archive expired listings + mark inactive orgs."""
from __future__ import annotations
from datetime import datetime, timezone, timedelta

from notifications import create_notification, purge_old_notifications

# In-memory cache: sla de laatste run-datum op zodat archivering per dag max 1x uitgevoerd wordt
_archive_last_run: str | None = None


async def archive_expired_listings(db) -> int:
    """Set status='gearchiveerd' on listings where deadline < today and not recurrent.

    Wordt maximaal één keer per dag uitgevoerd, ook al wordt de functie
    bij elke GET /listings aangeroepen.
    """
    global _archive_last_run
    today_iso = datetime.now(timezone.utc).date().isoformat()

    if _archive_last_run == today_iso:
        return 0  # Al uitgevoerd vandaag — meteen terug
    now = datetime.now(timezone.utc).isoformat()

    # Snapshot listings that will be archived so we can notify their owners
    to_archive = await db.listings.find(
        {
            "isRecurrent": False,
            "deadline": {"$ne": None, "$lt": today_iso},
            "status": "beschikbaar",
        },
        {"_id": 0, "id": 1, "userId": 1, "title": 1},
    ).to_list(500)

    result = await db.listings.update_many(
        {
            "isRecurrent": False,
            "deadline": {"$ne": None, "$lt": today_iso},
            "status": "beschikbaar",
        },
        {"$set": {"status": "gearchiveerd", "updatedAt": now}},
    )

    for lst in to_archive:
        msg = f'De deadline van je aanbieding "{lst.get("title","")}" is vervallen.'
        await create_notification(db, lst["userId"], "deadline_expired", msg, lst["id"], lst.get("title"))

    # Purge old notifications opportunistically
    await purge_old_notifications(db, days=30)

    _archive_last_run = today_iso  # Markeer als uitgevoerd voor vandaag
    return result.modified_count


async def mark_inactive_orgs(db) -> int:
    """Mark organisations inactive if no member logged in for 24 months."""
    threshold = (datetime.now(timezone.utc) - timedelta(days=730)).isoformat()

    active_orgs = set()
    async for user in db.users.find(
        {"status": "validated", "dateLastLogin": {"$gte": threshold}},
        {"organisationId": 1, "_id": 0},
    ):
        active_orgs.add(user.get("organisationId"))

    # Set to active first (for those that have any active members)
    if active_orgs:
        await db.organisations.update_many(
            {"id": {"$in": list(active_orgs)}, "status": {"$in": ["validated", "active", "inactive"]}},
            {"$set": {"status": "active", "updatedAt": datetime.now(timezone.utc).isoformat()}},
        )

    # Mark the rest as inactive (but only those that are currently active/validated)
    result = await db.organisations.update_many(
        {
            "id": {"$nin": list(active_orgs)},
            "status": {"$in": ["validated", "active"]},
        },
        {"$set": {"status": "inactive", "updatedAt": datetime.now(timezone.utc).isoformat()}},
    )
    return result.modified_count
