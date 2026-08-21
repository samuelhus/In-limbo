"""
Eenmalig migratiescript: zet offererUserId op bestaande Conversation-
documenten die dit veld nog niet hebben (gesprekken aangemaakt vóór
offererUserId een opgeslagen momentopname werd — zie models.py en
routes/conversations.py::create_conversation).

Vóór deze wijziging werd offererUserId nergens opgeslagen en steeds live
afgeleid uit Listing.userId. Zodra de onderliggende listing hard verwijderd
werd (routes/listings.py::delete_listing verwijdert de listing + haar
applications, maar laat het gesprek bewust bestaan als berichtenhistoriek),
ging die afleiding onherstelbaar verloren: niemand kon het gesprek dan nog
inkijken of verwijderen (_load_conversation gaf voor iedereen 404).

Dit script achterhaalt offererUserId voor de resterende gesprekken zonder
dat veld, in dezelfde volgorde als de runtime-fallback
(_get_or_backfill_offerer_id in routes/conversations.py):
  1. Listing.userId, als de listing nog bestaat.
  2. De afzender van het eerste bericht in het gesprek (de aanvrager mag
     per PRD §3 pas reageren nadat de aanbieder zelf al iets stuurde, dus
     als er berichten zijn moet de eerste altijd van de aanbieder komen).
Gesprekken zonder listing én zonder berichten (aanbieder maakte het gesprek
aan maar stuurde nog nooit iets, en de listing is intussen verwijderd)
blijven onherleidbaar — er is dan geen data meer die de aanbieder
identificeert. Dat is een verwaarloosbaar randgeval; de runtime-fallback
vangt zulke uitzonderingen sowieso ook af zodra ze via een listing/bericht
alsnog herleidbaar worden.

Idempotent: opnieuw uitvoeren raakt enkel documenten waar offererUserId nog
ontbreekt.

Uitvoeren op de server:
    docker compose exec backend python scripts/backfill_conversation_offerer.py
"""
from __future__ import annotations
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from deps import db  # noqa: E402


async def main():
    via_listing = 0
    via_first_message = 0
    unresolved = 0

    cursor = db.conversations.find({"offererUserId": {"$exists": False}})
    async for conversation in cursor:
        listing = await db.listings.find_one({"id": conversation["listingId"]}, {"_id": 0, "userId": 1})
        offerer_id = listing["userId"] if listing else None
        if offerer_id:
            via_listing += 1
        else:
            first_message = await db.messages.find_one(
                {"conversationId": conversation["id"]}, sort=[("createdAt", 1)],
            )
            if first_message and first_message["senderId"] != conversation["requesterUserId"]:
                offerer_id = first_message["senderId"]
                via_first_message += 1

        if offerer_id:
            await db.conversations.update_one(
                {"id": conversation["id"]}, {"$set": {"offererUserId": offerer_id}},
            )
        else:
            unresolved += 1

    print(f"Klaar. Via listing: {via_listing}, via eerste bericht: {via_first_message}, onherleidbaar: {unresolved}.")

    remaining = await db.conversations.count_documents({"offererUserId": {"$exists": False}})
    print(f"Resterende gesprekken zonder offererUserId: {remaining}")


if __name__ == "__main__":
    asyncio.run(main())
