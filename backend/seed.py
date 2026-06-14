"""Seed admin + sample data. Idempotent."""
from __future__ import annotations
import os
import uuid
from datetime import datetime, timezone, timedelta
from auth import hash_password


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def seed(db) -> None:
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@inlimbo.be")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin123!")

    # 1. Admin -----------------------------------------------------------
    admin = await db.users.find_one({"email": admin_email})
    if admin is None:
        admin_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": admin_id,
            "email": admin_email,
            "passwordHash": hash_password(admin_password),
            "firstName": "Admin",
            "lastName": "In Limbo",
            "phone": None,
            "role": "admin",
            "status": "validated",
            "rejectionReason": None,
            "organisationId": "",
            "dateLastLogin": None,
            "createdAt": _iso_now(),
        })
    else:
        # Update password if it has changed
        from auth import verify_password
        if not verify_password(admin_password, admin["passwordHash"]):
            await db.users.update_one(
                {"email": admin_email},
                {"$set": {"passwordHash": hash_password(admin_password)}},
            )

    # 2. Validated orgs --------------------------------------------------
    seed_marker = await db.organisations.find_one({"_seed": True})
    if seed_marker:
        return

    org1_id = str(uuid.uuid4())
    org2_id = str(uuid.uuid4())
    org_pending_id = str(uuid.uuid4())

    await db.organisations.insert_many([
        {
            "id": org1_id,
            "name": "Atelier Brussel",
            "description": "Een collectief atelier in Molenbeek dat ruimte biedt aan beeldend kunstenaars en designers. We werken met gerecupereerd materiaal en delen onze infrastructuur met de buurt.",
            "category": "beeldende_kunsten",
            "address": "Rue de l'Avenir 12, 1080 Sint-Jans-Molenbeek",
            "website": "https://atelier-brussel.example",
            "photos": [
                "https://images.unsplash.com/photo-1596441560141-87a7c7b3a443?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80"
            ],
            "status": "active",
            "rejectionReason": None,
            "createdAt": _iso_now(),
            "updatedAt": _iso_now(),
            "_seed": True,
        },
        {
            "id": org2_id,
            "name": "Theatergezelschap Vagebond",
            "description": "Een onafhankelijk theatergezelschap dat sociaal-geëngageerd werk maakt. Na elke productie zoeken we een nieuwe bestemming voor decorstukken, kostuums en rekwisieten.",
            "category": "Podiumkunsten",
            "address": "Vlaamsesteenweg 80, 1000 Brussel",
            "website": "https://vagebond.example",
            "photos": [
                "https://images.unsplash.com/photo-1576544403918-c47d52572a9a?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80"
            ],
            "status": "active",
            "rejectionReason": None,
            "createdAt": _iso_now(),
            "updatedAt": _iso_now(),
            "_seed": True,
        },
        {
            "id": org_pending_id,
            "name": "Buurtwerk De Schakel",
            "description": "Buurtorganisatie die jongerenwerking en sociale activiteiten organiseert in Anderlecht. We zijn op zoek naar materiaal voor onze ateliers.",
            "category": "Sociaal werk",
            "address": "Bergensesteenweg 145, 1070 Anderlecht",
            "website": None,
            "photos": [],
            "status": "pending",
            "rejectionReason": None,
            "createdAt": _iso_now(),
            "updatedAt": _iso_now(),
            "_seed": True,
        },
    ])

    # 3. Validated users -------------------------------------------------
    user1_id = str(uuid.uuid4())
    user2_id = str(uuid.uuid4())
    pending_existing_id = str(uuid.uuid4())
    pending_new_id = str(uuid.uuid4())

    await db.users.insert_many([
        {
            "id": user1_id,
            "email": "lotte@atelier-brussel.example",
            "passwordHash": hash_password("User123!"),
            "firstName": "Lotte",
            "lastName": "Vandenberghe",
            "phone": "+32 478 12 34 56",
            "role": "user",
            "status": "validated",
            "rejectionReason": None,
            "organisationId": org1_id,
            "dateLastLogin": _iso_now(),
            "createdAt": _iso_now(),
        },
        {
            "id": user2_id,
            "email": "samir@vagebond.example",
            "passwordHash": hash_password("User123!"),
            "firstName": "Samir",
            "lastName": "El Khattabi",
            "phone": "+32 479 98 76 54",
            "role": "user",
            "status": "validated",
            "rejectionReason": None,
            "organisationId": org2_id,
            "dateLastLogin": _iso_now(),
            "createdAt": _iso_now(),
        },
        {
            "id": pending_existing_id,
            "email": "nora.pending@atelier-brussel.example",
            "passwordHash": hash_password("User123!"),
            "firstName": "Nora",
            "lastName": "Janssens",
            "phone": None,
            "role": "user",
            "status": "pending",
            "rejectionReason": None,
            "organisationId": org1_id,
            "dateLastLogin": None,
            "createdAt": _iso_now(),
        },
        {
            "id": pending_new_id,
            "email": "tom@deschakel.example",
            "passwordHash": hash_password("User123!"),
            "firstName": "Tom",
            "lastName": "De Cock",
            "phone": "+32 477 11 22 33",
            "role": "user",
            "status": "pending",
            "rejectionReason": None,
            "organisationId": org_pending_id,
            "dateLastLogin": None,
            "createdAt": _iso_now(),
        },
    ])

    # 4. Listings --------------------------------------------------------
    future_date = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()
    far_future = (datetime.now(timezone.utc) + timedelta(days=90)).date().isoformat()

    listing_lariks_id = str(uuid.uuid4())
    listing_gordijnen_id = str(uuid.uuid4())
    listing_staal_id = str(uuid.uuid4())
    listing_paletten_id = str(uuid.uuid4())
    listing_lampen_id = str(uuid.uuid4())

    await db.listings.insert_many([
        {
            "id": listing_lariks_id,
            "title": "Lariks balken — 4 stuks",
            "description": "Vier balken in lariks, ca. 240 cm lang. Resten van een tentoonstellingsbouw. Geschikt voor decor, meubel of bouwprojecten.",
            "weight": 22.0,
            "material": "Hout",
            "photos": [
                "https://images.unsplash.com/photo-1678184095759-db539ff697a2?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80"
            ],
            "deadline": future_date,
            "isRecurrent": False,
            "dimensions": "240 x 8 x 8 cm",
            "transport": "Ophalen in Molenbeek",
            "status": "beschikbaar",
            "selectedApplicantId": None,
            "userId": user1_id,
            "organisationId": org1_id,
            "createdAt": _iso_now(),
            "updatedAt": _iso_now(),
        },
        {
            "id": listing_gordijnen_id,
            "title": "Rode fluwelen gordijnen",
            "description": "Twee zware fluwelen gordijnen, gebruikt voor onze laatste productie. In goede staat, donkerrood, 4m hoog.",
            "weight": 18.0,
            "material": "Textiel",
            "photos": [
                "https://images.unsplash.com/photo-1576544403918-c47d52572a9a?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80"
            ],
            "deadline": far_future,
            "isRecurrent": False,
            "dimensions": "400 x 220 cm",
            "transport": "Af te halen of binnen Brussel te leveren",
            "status": "beschikbaar",
            "selectedApplicantId": None,
            "userId": user2_id,
            "organisationId": org2_id,
            "createdAt": _iso_now(),
            "updatedAt": _iso_now(),
        },
        {
            "id": listing_staal_id,
            "title": "Stalen H-profielen",
            "description": "Restanten van een installatie. Vier stukken staal met H-profiel, lengtes tussen 1m en 2m. Lichte oppervlakteroest.",
            "weight": 65.0,
            "material": "Metaal",
            "photos": [
                "https://images.pexels.com/photos/18420594/pexels-photo-18420594.jpeg?auto=compress&cs=tinysrgb&w=1200"
            ],
            "deadline": None,
            "isRecurrent": True,
            "dimensions": None,
            "transport": None,
            "status": "beschikbaar",
            "selectedApplicantId": None,
            "userId": user1_id,
            "organisationId": org1_id,
            "createdAt": _iso_now(),
            "updatedAt": _iso_now(),
        },
        {
            "id": listing_paletten_id,
            "title": "Houten paletten (15x)",
            "description": "Vijftien euro-paletten in goede staat. Ideaal voor tijdelijke constructies, decor of meubilair.",
            "weight": 300.0,
            "material": "Hout",
            "photos": [
                "https://images.unsplash.com/photo-1596441560141-87a7c7b3a443?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80"
            ],
            "deadline": future_date,
            "isRecurrent": False,
            "dimensions": "120 x 80 x 14 cm per stuk",
            "transport": "Ophalen met bestelwagen",
            "status": "in_magazijn",
            "selectedApplicantId": None,
            "userId": user1_id,
            "organisationId": org1_id,
            "createdAt": _iso_now(),
            "updatedAt": _iso_now(),
        },
        {
            "id": listing_lampen_id,
            "title": "Wandlampen — vintage",
            "description": "Set van zes vintage wandlampen uit een afgelopen voorstelling. Werkende E27-fittingen.",
            "weight": 4.5,
            "material": "Electro",
            "photos": [
                "https://images.unsplash.com/photo-1576544403918-c47d52572a9a?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80"
            ],
            "deadline": far_future,
            "isRecurrent": False,
            "dimensions": None,
            "transport": None,
            "status": "herbestemd",
            "selectedApplicantId": None,
            "userId": user2_id,
            "organisationId": org2_id,
            "createdAt": _iso_now(),
            "updatedAt": _iso_now(),
        },
    ])

    # 5. Seed application — Samir (Vagebond) applies to Lotte's Lariks balken
    await db.applications.insert_one({
        "id": str(uuid.uuid4()),
        "listingId": listing_lariks_id,
        "applicantUserId": user2_id,
        "applicantOrganisationId": org2_id,
        "motivation": "We bouwen volgende maand een nieuw decor voor een buitenvoorstelling in het Josaphatpark. De lariks balken zouden perfect zijn als kader voor de coulissen. We kunnen ze ophalen met onze bestelwagen.",
        "status": "open",
        "createdAt": _iso_now(),
        "updatedAt": _iso_now(),
    })

    # 6. Donateur — individu die materiaal doneert
    donateur_id = str(uuid.uuid4())
    await db.users.insert_one({
        "id": donateur_id,
        "email": "donna@inlimbo.be",
        "passwordHash": hash_password("test1234"),
        "username": "dana_doneert",
        "firstName": None,
        "lastName": None,
        "phone": None,
        "role": "donateur",
        "status": "validated",
        "rejectionReason": None,
        "organisationId": None,
        "dateLastLogin": None,
        "createdAt": _iso_now(),
    })

    # 7. Donateur-aanbieding — toont "geen In Limbo partner"-label
    await db.listings.insert_one({
        "id": str(uuid.uuid4()),
        "title": "Oude verfresten — 8 potten",
        "description": "Acht halfvolle potten muurverf (wit, beige, grijs) uit een renovatie. Nog perfect bruikbaar voor schilder- of decorprojecten. Ophalen in Schaarbeek.",
        "weight": 12.0,
        "material": "Vloeistof",
        "photos": [
            "https://images.unsplash.com/photo-1562259949-e8e7689d7828?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80"
        ],
        "deadline": future_date,
        "isRecurrent": False,
        "dimensions": None,
        "transport": "Op te halen in Schaarbeek",
        "status": "beschikbaar",
        "selectedApplicantId": None,
        "userId": donateur_id,
        "organisationId": None,
        "createdAt": _iso_now(),
        "updatedAt": _iso_now(),
    })
