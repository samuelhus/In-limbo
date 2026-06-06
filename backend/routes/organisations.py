"""Organisations: public list/search/get + member/admin update."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Depends, Query

from deps import db, now_iso, strip_mongo
from models import OrgUpdate
from auth import get_validated_user

router = APIRouter()


@router.get("/organisations")
async def list_organisations(
    q: str = Query("", description="Search query for org name"),
    validated_only: bool = Query(True),
):
    """Public list. If validated_only, only orgs visible to public."""
    filt: dict = {}
    if validated_only:
        filt["status"] = {"$in": ["validated", "active"]}
    if q:
        if len(q) < 2:
            return []
        filt["name"] = {"$regex": q, "$options": "i"}

    cursor = db.organisations.find(filt).sort("name", 1).limit(50)
    out = []
    async for o in cursor:
        out.append(strip_mongo(o))
    return out


@router.get("/organisations/search")
async def search_organisations(q: str = Query(..., min_length=2)):
    regex = {"$regex": q, "$options": "i"}
    docs = await db.organisations.find(
        {"name": regex, "status": {"$in": ["validated", "active"]}},
        {"_id": 0, "id": 1, "name": 1, "category": 1},
    ).limit(10).to_list(10)
    return docs


@router.get("/organisations/{org_id}")
async def get_organisation(org_id: str):
    org = await db.organisations.find_one({"id": org_id})
    if not org:
        raise HTTPException(404, "Organisatie niet gevonden")
    if org["status"] not in ("validated", "active", "inactive"):
        raise HTTPException(404, "Organisatie niet beschikbaar")
    return strip_mongo(org)


@router.patch("/organisations/{org_id}")
async def update_organisation(
    org_id: str, body: OrgUpdate, user: dict = Depends(get_validated_user),
):
    if user["organisationId"] != org_id and user["role"] != "admin":
        raise HTTPException(403, "Niet toegestaan")
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not update:
        return await get_organisation(org_id)
    update["updatedAt"] = now_iso()
    await db.organisations.update_one({"id": org_id}, {"$set": update})
    return await get_organisation(org_id)
