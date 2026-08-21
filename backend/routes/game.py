"""Schat of Schroot? — publieke spelroutes (zie prd/PRD_Schat_of_Schroot.md en
prd/TECHDESIGN_Schat_of_Schroot.md). Volledig losstaand van het hoofdplatform:
eigen auth (game_auth.py), eigen collecties (game_users/game_interactions/
game_evaluations). De enige raakvlak met het bestaande datamodel is de
`listings`-collectie, die er 2 optionele velden bij krijgt (gameEnabled/
gameEvaluationCount) — zie routes/admin_game.py voor het beheer daarvan.

POST /register staat achter dezelfde IP-based rate limiter (deps.py::limiter)
als de rest van het platform, om te vermijden dat iemand snel achter elkaar
veel verschillende usernames aanmaakt — zie _register_rate_limit_key voor de
vrijstelling voor een ingelogde admin van het hoofdplatform.

Spelpool (GAME_POOL_STATUSES, models.py): listings met status "beschikbaar" of
"in_magazijn" — bevestigd met product, dezelfde statusset als de publieke
catalogus (routes/listings.py). gameEnabled/gameEvaluationCount ontbreken op
listings die van vóór deze feature dateren; overal hieronder wordt een
ontbrekend veld dus expliciet als "nog niet aangeraakt" (gameEnabled=true,
gameEvaluationCount=0) behandeld via een `$or`-met-`$exists`-fallback, want
Mongo's `$lt`/`$ne`-vergelijkingsoperatoren matchen een ontbrekend veld NIET
vanzelf (in tegenstelling tot wat je zou verwachten) — zie _game_pool_filter.

Racecondities (cf. techdesign §4): de 20-evaluaties-cap wordt bewaakt via één
atomische find_one_and_update op de listing (reserveert een "slot" vóórdat de
evaluatie zelf geschreven wordt); dubbele evaluaties door dezelfde speler
worden bewaakt via de unique index op game_interactions (insert, geen
read-then-write). Zie evaluate() voor de volledige, gecommentarieerde flow
inclusief compenserende rollback als een van beide stappen na de reservering
alsnog faalt.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Body, HTTPException, Depends, Query, Request, Response
from pymongo import ReturnDocument
from pymongo.collation import Collation
from pymongo.errors import DuplicateKeyError

from deps import db, now_iso, limiter, get_real_ip
from models import (
    GameRegisterBody, GameSwipeBody, GameEvaluateBody, GameChooseBestBody,
    MAX_GAME_EVALUATIONS_PER_LISTING, GAME_POOL_STATUSES,
)
from game_auth import (
    get_current_game_user, create_game_token, set_game_auth_cookie, clear_game_auth_cookie,
)
from auth import is_admin_request

router = APIRouter(prefix="/game", tags=["game"])

_USERNAME_COLLATION = Collation(locale="en", strength=2)  # case-insensitive (PRD §3)


def _under_cap_filter() -> dict:
    """Ontbrekend gameEvaluationCount telt als 0 (nog nooit geëvalueerd) — zie
    module-docstring voor waarom dit niet met enkel `$lt` kan."""
    return {"$or": [
        {"gameEvaluationCount": {"$lt": MAX_GAME_EVALUATIONS_PER_LISTING}},
        {"gameEvaluationCount": {"$exists": False}},
    ]}


def _game_enabled_filter() -> dict:
    # $ne matcht een ontbrekend veld wél vanzelf (in tegenstelling tot $lt),
    # dus hier volstaat gewoon $ne False — listings zonder het veld zijn
    # default "enabled" (PRD/techdesign §1: gameEnabled default true).
    return {"gameEnabled": {"$ne": False}}


def _serialize_evaluation(doc: dict, viewer_id: str) -> dict:
    """Publieke vorm van een evaluatie voor de keuzepanelen — bewust zonder
    userId/username: de speler kiest op basis van de inhoud, niet van wie hem
    schreef (PRD §4.2 stap 6). `isMine` laat de front-end enkel de eigen kaart
    anders stijlen/geen extra punt beloven."""
    return {
        "id": doc["id"],
        "answer1": doc["answer1"],
        "answer2": doc["answer2"],
        "votes": doc.get("votes", 0),
        "isMine": doc["userId"] == viewer_id,
    }


def _register_rate_limit_key(request: Request) -> str:
    """Sleutel voor de rate limit op POST /register hieronder — normaal het
    IP (zoals overal elders, zie deps.py::limiter), behalve voor een
    ingelogde admin van het hoofdplatform (auth.py::is_admin_request): die
    krijgt telkens een eigen, unieke sleutel i.p.v. het gedeelde IP-emmertje,
    zodat hun aanvragen nooit meetellen voor de limiet en ze dus nooit
    geblokkeerd raken bij het testen/beheren — puur een gemaksvrijstelling,
    geen toegangscontrole (de route blijft zelf gewoon publiek)."""
    if is_admin_request(request):
        return f"admin-exempt-{uuid.uuid4()}"
    return get_real_ip(request)


@router.post("/register")
@limiter.limit("10/minute", key_func=_register_rate_limit_key)
# body expliciet als = Body(...) (i.p.v. enkel het type-annotatie), zoals
# overal elders in de codebase waar een rate-limited route ook een
# `request: Request`-parameter heeft (zie auth.py/contact.py) — zonder dat
# gaf FastAPI hier een 422 "field required" op username/email terug, ook al
# stond de JSON-body er wel degelijk correct in.
async def game_register(request: Request, body: GameRegisterBody = Body(...), response: Response = None):
    if not body.consentAccepted:
        raise HTTPException(400, "Je moet akkoord gaan met de gegevensverwerking om te kunnen spelen.")

    existing = await db.game_users.find_one({"username": body.username}, collation=_USERNAME_COLLATION)
    if existing:
        if existing.get("anonymized"):
            raise HTTPException(409, "Deze username is niet meer beschikbaar.")
        if existing["email"].strip().lower() != body.email.strip().lower():
            raise HTTPException(409, "Username al in gebruik")
        token = create_game_token(existing["id"], existing["username"])
        set_game_auth_cookie(response, token)
        return {"id": existing["id"], "username": existing["username"]}

    doc = {
        "id": str(uuid.uuid4()),
        "username": body.username,
        "email": body.email,
        "createdAt": now_iso(),
        "consentAt": now_iso(),
        "anonymized": False,
    }
    await db.game_users.insert_one(doc)
    token = create_game_token(doc["id"], doc["username"])
    set_game_auth_cookie(response, token)
    return {"id": doc["id"], "username": doc["username"]}


@router.get("/me")
async def game_me(user: dict = Depends(get_current_game_user)):
    return {"id": user["id"], "username": user["username"]}


@router.post("/logout")
async def game_logout(response: Response):
    clear_game_auth_cookie(response)
    return {"ok": True}


@router.get("/series")
async def get_series(user: dict = Depends(get_current_game_user)):
    """Random batch van max. 6 listings (PRD §4.3) — $sample met de
    spelpool-filters vooraf (techdesign §4). Minder dan 6 beschikbaar -> gewoon
    een kortere lijst teruggeven, de front-end sluit de reeks dan vroeger af."""
    seen_listing_ids = [
        doc["listingId"] async for doc in db.game_interactions.find(
            {"userId": user["id"]}, {"_id": 0, "listingId": 1},
        )
    ]
    match = {
        "status": {"$in": GAME_POOL_STATUSES},
        "photos.0": {"$exists": True},  # geen foto = niet speelbaar (swipe-kaart toont een foto)
        "id": {"$nin": seen_listing_ids},
        **_game_enabled_filter(),
        **_under_cap_filter(),
    }
    pipeline = [
        {"$match": match},
        {"$sample": {"size": 6}},
        {"$project": {
            "_id": 0, "id": 1, "title": 1, "description": 1, "material": 1,
            "photos": {"$slice": ["$photos", 1]},
        }},
    ]
    items = [doc async for doc in db.listings.aggregate(pipeline)]
    return {"items": items}


@router.post("/swipe")
async def swipe(body: GameSwipeBody, user: dict = Depends(get_current_game_user)):
    """Bij links (afwijzen): registreert een 'reject'-interactie zodat de
    listing niet opnieuw in /series van deze speler verschijnt (PRD §4.2 stap
    4). Bij rechts: bewust een no-op — de front-end gaat direct door naar het
    evaluatieformulier; de interactie wordt pas bij /evaluate weggeschreven
    (techdesign §2)."""
    if body.direction == "left":
        try:
            await db.game_interactions.insert_one({
                "id": str(uuid.uuid4()),
                "userId": user["id"],
                "listingId": body.listingId,
                "type": "reject",
                "createdAt": now_iso(),
            })
        except DuplicateKeyError:
            pass  # al eerder geïnteracteerd met deze listing — idempotent, geen fout
    return {"ok": True}


@router.post("/evaluate")
async def evaluate(body: GameEvaluateBody, user: dict = Depends(get_current_game_user)):
    # Stap 1: reserveer atomisch een "slot" op de cap van 20 (techdesign §4) —
    # ReturnDocument.BEFORE geeft meteen de telling van vóór deze evaluatie
    # terug, wat isFirstEvaluator hieronder bepaalt zonder aparte read.
    before = await db.listings.find_one_and_update(
        {"id": body.listingId, **_game_enabled_filter(), **_under_cap_filter()},
        {"$inc": {"gameEvaluationCount": 1}},
        return_document=ReturnDocument.BEFORE,
    )
    if not before:
        raise HTTPException(409, "Deze aanbieding is niet (meer) beschikbaar in het spel.")

    # Stap 2: dedupliceer "1 evaluatie per speler per listing" (PRD §4.2 stap
    # 4) via de unique index op game_interactions, niet via een voorafgaande
    # read — bij een DuplicateKeyError geven we het gereserveerde slot terug
    # (compensatie) zodat een mislukte poging de cap niet nodeloos opsoupeert.
    try:
        await db.game_interactions.insert_one({
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "listingId": body.listingId,
            "type": "evaluate",
            "chosenBest": False,       # zie choose_best() — gate tegen een 2de, definitieve keuze
            "chosenEvaluationId": None,
            "createdAt": now_iso(),
        })
    except DuplicateKeyError:
        await db.listings.update_one({"id": body.listingId}, {"$inc": {"gameEvaluationCount": -1}})
        raise HTTPException(409, "Je hebt deze aanbieding al geëvalueerd.")

    is_first_evaluator = before.get("gameEvaluationCount", 0) == 0

    # Top-evaluaties (bij ex aequo: ALLE tied evaluaties, PRD §4.2 stap 6) —
    # opgehaald vóór het invoegen van de eigen nieuwe evaluatie, zodat die er
    # vanzelf niet dubbel in zit; hieronder expliciet toegevoegd aan de respons.
    top_evaluations: list[dict] = []
    if not is_first_evaluator:
        existing = [
            e async for e in db.game_evaluations.find(
                {"listingId": body.listingId, "hidden": False}, {"_id": 0},
            )
        ]
        if existing:
            max_votes = max(e.get("votes", 0) for e in existing)
            top_evaluations = [_serialize_evaluation(e, user["id"]) for e in existing if e.get("votes", 0) == max_votes]

    now = now_iso()
    evaluation_doc = {
        "id": str(uuid.uuid4()),
        "listingId": body.listingId,
        "userId": user["id"],
        "answer1": body.answer1,
        "answer2": body.answer2,
        "points": 1,
        "votes": 0,
        "hidden": False,
        "createdAt": now,
    }
    await db.game_evaluations.insert_one(evaluation_doc)

    if not is_first_evaluator:
        top_evaluations.append(_serialize_evaluation(evaluation_doc, user["id"]))

    return {"isFirstEvaluator": is_first_evaluator, "topEvaluations": top_evaluations}


@router.post("/choose-best")
async def choose_best(body: GameChooseBestBody, user: dict = Depends(get_current_game_user)):
    """PRD §4.2 stap 6: definitieve keuze, geen bevestigingsstap, geen wijziging
    achteraf. De atomische filter hieronder (chosenBest != true) zorgt dat een
    2de aanroep — dubbele klik, replay — altijd 409 geeft in plaats van een 2de
    keer punten toe te kennen."""
    interaction = await db.game_interactions.find_one_and_update(
        {"userId": user["id"], "listingId": body.listingId, "type": "evaluate", "chosenBest": {"$ne": True}},
        {"$set": {"chosenBest": True, "chosenEvaluationId": body.evaluationId}},
    )
    if not interaction:
        raise HTTPException(409, "Deze keuze is al gemaakt, of je hebt deze aanbieding nog niet geëvalueerd.")

    chosen = await db.game_evaluations.find_one({"id": body.evaluationId, "listingId": body.listingId})
    if not chosen:
        # Zet de gate terug open — een ongeldig evaluationId mag de speler niet
        # permanent blokkeren voor deze listing.
        await db.game_interactions.update_one(
            {"userId": user["id"], "listingId": body.listingId, "type": "evaluate"},
            {"$set": {"chosenBest": False, "chosenEvaluationId": None}},
        )
        raise HTTPException(404, "Evaluatie niet gevonden")

    is_own = chosen["userId"] == user["id"]
    if not is_own:
        # +3 punten voor kwaliteit (PRD §4.2 stap 6/§5) — eigen evaluatie kiezen levert niets extra op.
        await db.game_evaluations.update_one({"id": body.evaluationId}, {"$inc": {"votes": 1, "points": 3}})
    return {"ok": True, "own": is_own}


@router.get("/leaderboard")
async def leaderboard(
    scope: Literal["monthly", "alltime"] = Query("alltime"),
    user: dict = Depends(get_current_game_user),
):
    """Top 10 (PRD §5) — monthly filtert op de lopende kalendermaand, alltime
    niet. Verborgen (gemodereerde) evaluaties tellen in geen van beide mee."""
    match: dict = {"hidden": False}
    if scope == "monthly":
        now = datetime.now(timezone.utc)
        start_of_month = datetime(now.year, now.month, 1, tzinfo=timezone.utc).isoformat()
        match["createdAt"] = {"$gte": start_of_month}

    pipeline = [
        {"$match": match},
        {"$group": {"_id": "$userId", "points": {"$sum": "$points"}}},
        {"$sort": {"points": -1}},
        {"$limit": 10},
    ]
    rows = [r async for r in db.game_evaluations.aggregate(pipeline)]
    user_ids = [r["_id"] for r in rows]
    users = {
        u["id"]: u async for u in db.game_users.find(
            {"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "username": 1},
        )
    }
    return [
        {"username": users.get(r["_id"], {}).get("username") or "Verwijderde speler", "points": r["points"]}
        for r in rows
    ]
