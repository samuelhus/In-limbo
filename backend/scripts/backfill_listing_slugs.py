"""
Eenmalig migratiescript: genereert een slug voor elke bestaande aanbieding
die er nog geen heeft (aanbiedingen aangemaakt vóór de 'betekenisvolle URL'-feature).

Uitvoeren op de server:
    docker compose exec backend python scripts/backfill_listing_slugs.py
"""
from __future__ import annotations
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from deps import db, generate_unique_listing_slug  # noqa: E402


async def main():
    cursor = db.listings.find({"$or": [{"slug": None}, {"slug": {"$exists": False}}]})
    count = 0
    async for listing in cursor:
        slug = await generate_unique_listing_slug(db, listing.get("title", ""), listing["id"])
        await db.listings.update_one({"id": listing["id"]}, {"$set": {"slug": slug}})
        print(f"  {listing.get('title', '(zonder titel)')!r} -> {slug}")
        count += 1
    print(f"\nKlaar. {count} aanbieding(en) van een slug voorzien.")


if __name__ == "__main__":
    asyncio.run(main())
