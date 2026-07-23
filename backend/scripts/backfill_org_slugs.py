"""
Eenmalig migratiescript: genereert een slug voor elke bestaande organisatie
die er nog geen heeft (organisaties aangemaakt vóór de 'custom URL'-feature).

Uitvoeren op de server:
    docker compose exec backend python scripts/backfill_org_slugs.py
"""
from __future__ import annotations
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from deps import db, generate_unique_org_slug  # noqa: E402


async def main():
    cursor = db.organisations.find({"$or": [{"slug": None}, {"slug": {"$exists": False}}]})
    count = 0
    async for org in cursor:
        slug = await generate_unique_org_slug(db, org["name"], org["id"])
        await db.organisations.update_one({"id": org["id"]}, {"$set": {"slug": slug}})
        print(f"  {org['name']!r} -> {slug}")
        count += 1
    print(f"\nKlaar. {count} organisatie(s) van een slug voorzien.")


if __name__ == "__main__":
    asyncio.run(main())
