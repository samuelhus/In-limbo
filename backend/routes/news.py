"""Nieuws- en Inspiratieberichten (publiek lezen, admin beheer)."""
from __future__ import annotations
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends

from deps import db, now_iso
from models import NewsPostCreate, NewsPostUpdate, EVENT_DATE_CATEGORIES
from auth import get_admin_user

router = APIRouter()

FIELDS = [
    "postType", "category", "languages", "photo", "eventDate",
    "titleNl", "titleFr", "contentNl", "contentFr", "photos", "link", "tags",
]


def _serialize_news(doc: dict) -> dict:
    out = {
        "id": doc["id"],
        "authorId": doc["authorId"],
        "createdAt": doc["createdAt"],
        "updatedAt": doc.get("updatedAt", doc["createdAt"]),
    }
    for f in FIELDS:
        out[f] = doc.get(f)
    return out


@router.get("/news")
async def list_news(
    skip: int = 0,
    limit: int = 50,
    postType: Optional[str] = None,
    category: Optional[str] = None,
):
    limit = min(limit, 100)
    query: dict = {}
    if postType:
        query["postType"] = postType
    if category:
        query["category"] = category
    docs = await db.news.find(query).sort("createdAt", -1).skip(skip).limit(limit).to_list(limit)
    return [_serialize_news(d) for d in docs]


@router.get("/news/{post_id}")
async def get_news(post_id: str):
    doc = await db.news.find_one({"id": post_id})
    if not doc:
        raise HTTPException(404, "Bericht niet gevonden")
    return _serialize_news(doc)


@router.post("/news")
async def create_news(body: NewsPostCreate, admin: dict = Depends(get_admin_user)):
    now = now_iso()
    doc = {"id": str(uuid.uuid4()), "authorId": admin["id"], "createdAt": now, "updatedAt": now}
    for f in FIELDS:
        val = getattr(body, f)
        if isinstance(val, str):
            val = val.strip() or None
        doc[f] = val
    await db.news.insert_one(doc)
    return _serialize_news(doc)


@router.put("/news/{post_id}")
async def update_news(post_id: str, body: NewsPostUpdate, admin: dict = Depends(get_admin_user)):
    doc = await db.news.find_one({"id": post_id})
    if not doc:
        raise HTTPException(404, "Bericht niet gevonden")
    update: dict = {"updatedAt": now_iso()}
    for f in FIELDS:
        val = getattr(body, f)
        if val is not None:
            if isinstance(val, str):
                val = val.strip() or None
            update[f] = val

    # NewsPostUpdate valideert (net als titel/inhoud) niet zelf de
    # verplichte-eventDate-regel, want dat hangt af van de resulterende
    # (mogelijk deels ongewijzigde) categorie. Check dat hier op de
    # samengevoegde toestand, zodat een bewerking de datum niet stilletjes
    # kan laten verdwijnen voor categorieën die ze verplicht stellen.
    finalPostType = update.get("postType", doc.get("postType"))
    finalCategory = update.get("category", doc.get("category"))
    if finalPostType == "nieuws" and finalCategory in EVENT_DATE_CATEGORIES:
        finalEventDate = update["eventDate"] if "eventDate" in update else doc.get("eventDate")
        if not finalEventDate:
            raise HTTPException(422, "Datum van het evenement is verplicht voor deze categorie")

    await db.news.update_one({"id": post_id}, {"$set": update})
    updated = await db.news.find_one({"id": post_id})
    return _serialize_news(updated)


@router.delete("/news/{post_id}")
async def delete_news(post_id: str, admin: dict = Depends(get_admin_user)):
    res = await db.news.delete_one({"id": post_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Bericht niet gevonden")
    return {"ok": True}
