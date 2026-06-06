"""Nieuwsberichten (publiek lezen, admin beheer)."""
from __future__ import annotations
import uuid

from fastapi import APIRouter, HTTPException, Depends

from deps import db, now_iso
from models import NewsPostCreate, NewsPostUpdate
from auth import get_admin_user

router = APIRouter()


def _serialize_news(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "title": doc["title"],
        "category": doc["category"],
        "content": doc["content"],
        "photo": doc.get("photo"),
        "authorId": doc["authorId"],
        "createdAt": doc["createdAt"],
        "updatedAt": doc.get("updatedAt", doc["createdAt"]),
    }


@router.get("/news")
async def list_news():
    docs = await db.news.find({}).sort("createdAt", -1).to_list(None)
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
    doc = {
        "id": str(uuid.uuid4()),
        "title": body.title.strip(),
        "category": body.category,
        "content": body.content.strip(),
        "photo": body.photo,
        "authorId": admin["id"],
        "createdAt": now,
        "updatedAt": now,
    }
    await db.news.insert_one(doc)
    return _serialize_news(doc)


@router.put("/news/{post_id}")
async def update_news(post_id: str, body: NewsPostUpdate, admin: dict = Depends(get_admin_user)):
    doc = await db.news.find_one({"id": post_id})
    if not doc:
        raise HTTPException(404, "Bericht niet gevonden")
    update: dict = {"updatedAt": now_iso()}
    if body.title is not None:
        update["title"] = body.title.strip()
    if body.category is not None:
        update["category"] = body.category
    if body.content is not None:
        update["content"] = body.content.strip()
    if body.photo is not None:
        update["photo"] = body.photo or None
    await db.news.update_one({"id": post_id}, {"$set": update})
    updated = await db.news.find_one({"id": post_id})
    return _serialize_news(updated)


@router.delete("/news/{post_id}")
async def delete_news(post_id: str, admin: dict = Depends(get_admin_user)):
    res = await db.news.delete_one({"id": post_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Bericht niet gevonden")
    return {"ok": True}
