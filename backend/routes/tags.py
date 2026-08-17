"""Tags voor inspiratie-posts (publiek lezen, admin beheer).

Tags zijn losstaand opgeslagen (eigen collectie), posts verwijzen enkel naar
het tag-ID. Bij verwijderen van een tag wordt die overal uit bestaande posts
gehaald, zodat er nooit een 'weesverwijzing' naar een niet-bestaande tag
blijft hangen.
"""
from __future__ import annotations
import uuid

from fastapi import APIRouter, HTTPException, Depends

from deps import db, now_iso
from models import TagCreate, TagUpdate
from auth import get_admin_user

router = APIRouter()


def _serialize_tag(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "nameNl": doc["nameNl"],
        "nameFr": doc["nameFr"],
        "createdAt": doc["createdAt"],
    }


@router.get("/tags")
async def list_tags():
    """Publiek — geeft alle tags terug, alfabetisch op NL-naam.
    Gebruikt zowel door het admin-formulier (dropdown bestaande tags) als
    door de publieke Inspiratie-filter."""
    docs = await db.tags.find({}).sort("nameNl", 1).to_list(1000)
    return [_serialize_tag(d) for d in docs]


@router.post("/admin/tags")
async def create_tag(body: TagCreate, admin: dict = Depends(get_admin_user)):
    # Voorkom dubbele tags met exact dezelfde NL-naam (case-insensitive) —
    # geen harde technische noodzaak, maar voorkomt per-ongeluk-duplicaten
    # in de dropdown die admins nadien weer manueel zouden moeten opruimen.
    existing = await db.tags.find_one({"nameNl": {"$regex": f"^{body.nameNl}$", "$options": "i"}})
    if existing:
        raise HTTPException(400, f"Er bestaat al een tag met de naam '{body.nameNl}'")
    now = now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "nameNl": body.nameNl,
        "nameFr": body.nameFr,
        "createdAt": now,
    }
    await db.tags.insert_one(doc)
    return _serialize_tag(doc)


@router.patch("/admin/tags/{tag_id}")
async def update_tag(tag_id: str, body: TagUpdate, admin: dict = Depends(get_admin_user)):
    doc = await db.tags.find_one({"id": tag_id})
    if not doc:
        raise HTTPException(404, "Tag niet gevonden")
    update: dict = {}
    if body.nameNl is not None:
        update["nameNl"] = body.nameNl
    if body.nameFr is not None:
        update["nameFr"] = body.nameFr
    if update:
        await db.tags.update_one({"id": tag_id}, {"$set": update})
    updated = await db.tags.find_one({"id": tag_id})
    return _serialize_tag(updated)


@router.delete("/admin/tags/{tag_id}")
async def delete_tag(tag_id: str, admin: dict = Depends(get_admin_user)):
    res = await db.tags.delete_one({"id": tag_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Tag niet gevonden")
    # Verwijder de tag ook overal uit bestaande posts, anders blijft er een
    # verwijzing naar een niet-bestaande tag hangen (weesverwijzing).
    await db.news.update_many({"tags": tag_id}, {"$pull": {"tags": tag_id}})
    return {"ok": True}
