"""Background-ish maintenance tasks: archive expired listings + mark inactive orgs."""
from __future__ import annotations
from datetime import datetime, timezone, timedelta


async def archive_expired_listings(db) -> int:
    """Set status='gearchiveerd' on listings where deadline < today and not recurrent."""
    today_iso = datetime.now(timezone.utc).date().isoformat()
    result = await db.listings.update_many(
        {
            "isRecurrent": False,
            "deadline": {"$ne": None, "$lt": today_iso},
            "status": {"$in": ["beschikbaar", "in_afwachting"]},
        },
        {"$set": {"status": "gearchiveerd", "updatedAt": datetime.now(timezone.utc).isoformat()}},
    )
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
