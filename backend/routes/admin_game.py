"""Admin-uitbreiding voor Schat of Schroot? (PRD §6) — achter de bestaande
admin-auth (get_admin_user, zelfde dependency als de rest van routes/admin.py),
maar in een eigen bestand omdat het een apart subsysteem beheert (game_users/
game_evaluations + de game-velden op listings) los van de rest van het
platform-beheer.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Depends, Query

from deps import db, strip_mongo, anonymize_game_user
from models import GameModerateBody, GameListingExcludeBody, GAME_POOL_STATUSES
from auth import get_admin_user

router = APIRouter(prefix="/admin/game", tags=["admin-game"])


@router.get("/users")
async def admin_game_users(admin: dict = Depends(get_admin_user)):
    """Lijst gebruikers (username + email) + statistieken per speler (PRD §6).
    totalPoints telt hier bewust ook punten van gemodereerde (hidden) evaluaties
    mee — dit is een intern admin-overzicht, geen publiek scorebord (dat sluit
    hidden wél uit, zie routes/game.py::leaderboard)."""
    pipeline = [
        {"$lookup": {"from": "game_evaluations", "localField": "id", "foreignField": "userId", "as": "evals"}},
        {"$project": {
            "_id": 0, "id": 1, "username": 1, "email": 1, "createdAt": 1, "anonymized": 1,
            "evaluationCount": {"$size": "$evals"},
            "totalPoints": {"$sum": "$evals.points"},
        }},
        {"$sort": {"createdAt": -1}},
    ]
    return [u async for u in db.game_users.aggregate(pipeline)]


@router.get("/listings-stats")
async def admin_game_listings_stats(admin: dict = Depends(get_admin_user)):
    """Statistieken per listing (PRD §6) + de gegevens om een listing uit de
    spelpool te halen (PATCH .../exclude hieronder). Scope: listings die nu in
    de spelpool zitten (status beschikbaar/in_magazijn) OF ooit al minstens 1
    evaluatie kregen (zodat speelgeschiedenis zichtbaar blijft, ook als de
    listing intussen van status veranderde — bv. herbestemd dankzij het spel)."""
    listings = [
        strip_mongo(l) async for l in db.listings.find(
            {"$or": [{"status": {"$in": GAME_POOL_STATUSES}}, {"gameEvaluationCount": {"$gt": 0}}]},
            {"_id": 0, "id": 1, "title": 1, "photos": 1, "status": 1, "gameEnabled": 1,
             "gameEvaluationCount": 1},
        ).sort("gameEvaluationCount", -1)
    ]
    listing_ids = [l["id"] for l in listings]

    # Top-evaluatie per listing: 1 aggregatiequery i.p.v. een query per listing,
    # gesorteerd op votes zodat de eerst-geziene evaluatie per listingId meteen
    # de topper is (setdefault houdt enkel die eerste vast).
    top_by_listing: dict[str, dict] = {}
    async for ev in db.game_evaluations.find(
        {"listingId": {"$in": listing_ids}, "hidden": False}, {"_id": 0},
    ).sort("votes", -1):
        top_by_listing.setdefault(ev["listingId"], ev)

    for l in listings:
        l["gameEnabled"] = l.get("gameEnabled", True)
        l["gameEvaluationCount"] = l.get("gameEvaluationCount", 0)
        top = top_by_listing.get(l["id"])
        l["topEvaluation"] = (
            {"id": top["id"], "answer1": top["answer1"], "answer2": top["answer2"], "votes": top.get("votes", 0)}
            if top else None
        )
    return listings


@router.get("/evaluations/top")
async def admin_game_top_evaluations(limit: int = Query(50, ge=1, le=200), admin: dict = Depends(get_admin_user)):
    """Top evaluaties over alle listings (PRD §6) — inclusief verborgen
    evaluaties (admin moet ze kunnen terugzien om ze eventueel te de-modereren,
    zie moderate_evaluation hieronder) en met username+email voor context
    (anders dan de speler-facing top-lijst in routes/game.py, die bewust
    anoniem blijft). listingStatus laat de admin-UI filteren op beschikbaarheid
    van de onderliggende listing (bv. enkel nog niet herbestemde tonen)."""
    evals = [
        strip_mongo(e) async for e in db.game_evaluations.find({}, {"_id": 0}).sort("votes", -1).limit(limit)
    ]
    listing_ids = list({e["listingId"] for e in evals})
    user_ids = list({e["userId"] for e in evals})
    listings = {
        l["id"]: l async for l in db.listings.find(
            {"id": {"$in": listing_ids}}, {"_id": 0, "id": 1, "title": 1, "status": 1},
        )
    }
    users = {
        u["id"]: u async for u in db.game_users.find(
            {"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "username": 1, "email": 1},
        )
    }
    for e in evals:
        listing = listings.get(e["listingId"], {})
        e["listingTitle"] = listing.get("title")
        e["listingStatus"] = listing.get("status")
        user = users.get(e["userId"], {})
        e["username"] = user.get("username")
        e["email"] = user.get("email")
    return evals


@router.patch("/evaluations/{evaluation_id}/moderate")
async def admin_moderate_evaluation(
    evaluation_id: str, body: GameModerateBody, admin: dict = Depends(get_admin_user),
):
    """Verberg/toon een evaluatie (PRD §6) — telt hierdoor niet meer mee in de
    publieke leaderboard/keuzepanelen (routes/game.py), maar blijft bestaan
    zodat votes/points-boekhouding en de admin-geschiedenis intact blijven."""
    result = await db.game_evaluations.update_one({"id": evaluation_id}, {"$set": {"hidden": body.hidden}})
    if result.matched_count == 0:
        raise HTTPException(404, "Evaluatie niet gevonden")
    return {"ok": True}


@router.patch("/listings/{listing_id}/exclude")
async def admin_set_listing_game_enabled(
    listing_id: str, body: GameListingExcludeBody, admin: dict = Depends(get_admin_user),
):
    """Listing uit de spelpool halen of terugzetten (PRD §6) — bv. ondertussen
    elders gematcht, of niet geschikt voor het spel."""
    result = await db.listings.update_one({"id": listing_id}, {"$set": {"gameEnabled": body.gameEnabled}})
    if result.matched_count == 0:
        raise HTTPException(404, "Aanbieding niet gevonden")
    return {"ok": True}


@router.get("/listings/{listing_id}/evaluations")
async def admin_game_listing_evaluations(listing_id: str, admin: dict = Depends(get_admin_user)):
    """Alle evaluaties voor 1 listing (PRD §6) — i.t.t. /evaluations/top
    hierboven (over alle listings, enkel de bovenste N) toont dit ELKE
    evaluatie voor deze ene listing, inclusief verborgen exemplaren, zodat de
    admin hier (na doorklikken vanuit de Aanbiedingen-tab) specifieke
    evaluaties kan bekijken en verwijderen (zie DELETE hieronder)."""
    listing = await db.listings.find_one({"id": listing_id}, {"_id": 0, "id": 1, "title": 1})
    if not listing:
        raise HTTPException(404, "Aanbieding niet gevonden")
    evals = [
        strip_mongo(e) async for e in db.game_evaluations.find(
            {"listingId": listing_id}, {"_id": 0},
        ).sort("votes", -1)
    ]
    user_ids = list({e["userId"] for e in evals})
    users = {
        u["id"]: u async for u in db.game_users.find(
            {"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "username": 1, "email": 1},
        )
    }
    for e in evals:
        user = users.get(e["userId"], {})
        e["username"] = user.get("username")
        e["email"] = user.get("email")
    return {"listingTitle": listing["title"], "items": evals}


@router.delete("/evaluations/{evaluation_id}")
async def admin_delete_evaluation(evaluation_id: str, admin: dict = Depends(get_admin_user)):
    """Verwijdert een evaluatie permanent (i.p.v. enkel verbergen, zie
    moderate_evaluation hierboven) — voor duidelijk ongepaste inhoud die niet
    zomaar terug zichtbaar mag kunnen worden. Geeft de gereserveerde cap-slot
    terug (PRD/techdesign §4: max MAX_GAME_EVALUATIONS_PER_LISTING evaluaties
    per listing, zie routes/game.py::evaluate) zodat een vervangende evaluatie
    mogelijk blijft. Laat de onderliggende game_interactions-registratie
    bewust ongemoeid: de speler blijft geregistreerd als "heeft deze listing
    al geëvalueerd" en kan dus niet via een omweg langs verwijderen alsnog een
    2de keer indienen."""
    evaluation = await db.game_evaluations.find_one({"id": evaluation_id}, {"_id": 0, "listingId": 1})
    if not evaluation:
        raise HTTPException(404, "Evaluatie niet gevonden")
    await db.game_evaluations.delete_one({"id": evaluation_id})
    await db.listings.update_one(
        {"id": evaluation["listingId"], "gameEvaluationCount": {"$gt": 0}},
        {"$inc": {"gameEvaluationCount": -1}},
    )
    return {"ok": True}


@router.delete("/users/{game_user_id}")
async def admin_delete_game_user(game_user_id: str, admin: dict = Depends(get_admin_user)):
    """GDPR: gebruiker + diens data verwijderen/anonimiseren (PRD §3/§6) —
    hergebruikt hetzelfde patroon als het hoofdplatform (deps.anonymize_user),
    hier de game-specifieke variant (deps.anonymize_game_user)."""
    user = await db.game_users.find_one({"id": game_user_id}, {"_id": 0, "id": 1})
    if not user:
        raise HTTPException(404, "Speler niet gevonden")
    await anonymize_game_user(db, game_user_id)
    return {"ok": True}
