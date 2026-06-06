"""In-app notificaties."""
from __future__ import annotations
from fastapi import APIRouter, Depends

from deps import db
from auth import get_current_user

router = APIRouter()


def _serialize_notif(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "type": doc.get("type"),
        "message": doc.get("message"),
        "listingId": doc.get("listingId"),
        "listingTitle": doc.get("listingTitle"),
        "read": bool(doc.get("read", False)),
        "createdAt": doc.get("createdAt"),
    }


@router.get("/notifications/mine")
async def my_notifications(user: dict = Depends(get_current_user)):
    docs = await db.notifications.find({"userId": user["id"]}).sort("createdAt", -1).to_list(200)
    return [_serialize_notif(d) for d in docs]


@router.patch("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one(
        {"id": notif_id, "userId": user["id"]},
        {"$set": {"read": True}},
    )
    return {"ok": True}


@router.patch("/notifications/read-all")
async def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    res = await db.notifications.update_many(
        {"userId": user["id"], "read": False},
        {"$set": {"read": True}},
    )
    return {"ok": True, "modified": res.modified_count}


@router.delete("/notifications/clear-all")
async def clear_all_notifications(user: dict = Depends(get_current_user)):
    res = await db.notifications.delete_many({"userId": user["id"]})
    return {"ok": True, "deleted": res.deleted_count}


@router.delete("/notifications/{notif_id}")
async def delete_notification(notif_id: str, user: dict = Depends(get_current_user)):
    await db.notifications.delete_one({"id": notif_id, "userId": user["id"]})
    return {"ok": True}
