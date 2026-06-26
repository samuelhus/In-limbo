"""Background-ish maintenance tasks: archive expired listings + mark inactive orgs."""
from __future__ import annotations
from datetime import datetime, timezone, timedelta

from notifications import create_notification, purge_old_notifications

async def archive_expired_listings(db) -> int:
    """Set status='gearchiveerd' on listings where deadline < today and not recurrent."""
    today_iso = datetime.now(timezone.utc).date().isoformat()
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

    return result.modified_count


async def mark_inactive_orgs(db) -> int:
    """Mark organisations inactive if NO member logged in for 24+ months.

    Rules:
    - Only organisations with status 'validated' or 'active' are candidates.
    - A member counts as active if dateLastLogin exists AND >= threshold (24 months ago).
    - If dateLastLogin is missing on a user, we fall back to their createdAt date
      so a recently registered user doesn't accidentally make the org inactive.
    - We never touch orgs that are already 'pending' or 'inactive' (unless they
      become active again, in which case we restore them to 'validated').
    """
    threshold = (datetime.now(timezone.utc) - timedelta(days=730)).isoformat()
    now_str = datetime.now(timezone.utc).isoformat()

    # Collect orgs that have at least one recently active member.
    # A member is "active" if dateLastLogin >= threshold,
    # OR if dateLastLogin is missing but createdAt >= threshold (new member).
    active_orgs: set = set()
    async for user in db.users.find(
        {
            "status": "validated",
            "organisationId": {"$exists": True, "$ne": None},
            "$or": [
                {"dateLastLogin": {"$gte": threshold}},
                {"dateLastLogin": {"$exists": False}, "createdAt": {"$gte": threshold}},
            ],
        },
        {"organisationId": 1, "_id": 0},
    ):
        org_id = user.get("organisationId")
        if org_id:
            active_orgs.add(org_id)

    # Restore previously inactive orgs that now have active members back to 'validated'
    # (do NOT touch orgs in 'pending' status)
    if active_orgs:
        await db.organisations.update_many(
            {"id": {"$in": list(active_orgs)}, "status": "inactive"},
            {"$set": {"status": "validated", "updatedAt": now_str}},
        )

    # Mark as inactive only orgs that are currently 'validated' or 'active'
    # and have NO active members — never touch 'pending' orgs
    result = await db.organisations.update_many(
        {
            "id": {"$nin": list(active_orgs)},
            "status": {"$in": ["validated", "active"]},
        },
        {"$set": {"status": "inactive", "updatedAt": now_str}},
    )
    return result.modified_count
