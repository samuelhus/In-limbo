"""
Eenmalig migratiescript: zet preferredLanguage='nl' voor bestaande gebruikers
die dit veld nog niet hebben (accounts aangemaakt vóór de taalvoorkeur-feature).

De applicatiecode valt sowieso terug op 'nl' als het veld ontbreekt, dus dit
script is niet strikt noodzakelijk voor de werking — het maakt de data enkel
expliciet/consistent in de database zelf.

Idempotent: opnieuw uitvoeren heeft geen effect (raakt enkel documenten
waar het veld nog volledig ontbreekt).

Uitvoeren op de server:
    docker compose exec backend python scripts/backfill_preferred_language.py
"""
from __future__ import annotations
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from deps import db  # noqa: E402


async def main():
    res = await db.users.update_many(
        {"preferredLanguage": {"$exists": False}},
        {"$set": {"preferredLanguage": "nl"}},
    )
    print(f"Klaar. {res.modified_count} gebruiker(s) van preferredLanguage='nl' voorzien.")

    remaining = await db.users.count_documents({"preferredLanguage": {"$exists": False}})
    print(f"Resterende gebruikers zonder preferredLanguage: {remaining}")


if __name__ == "__main__":
    asyncio.run(main())
