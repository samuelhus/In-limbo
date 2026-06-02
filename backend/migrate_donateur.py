"""One-shot migration: role 'donnateur' → 'donateur'.

Idempotent: re-running has no effect. Re-emits a fresh JWT cookie for any
currently logged-in donateur on their next request, since the role claim in
the existing token is still 'donnateur'. The token-issuing logic now uses
'donateur', so once they hit /auth/me with their old token, the server's
get_current_user already returns the up-to-date user document from MongoDB
(which we update here). Existing tokens for affected users are therefore
invalidated by bumping their `tokenVersion` field (which forces a new login).

Usage:
    python /app/backend/migrate_donateur.py
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')


async def run():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    # 1. Rename role on users
    res = await db.users.update_many(
        {"role": "donnateur"},
        {"$set": {"role": "donateur"}},
    )
    print(f"users updated: {res.modified_count}")

    # 2. Bump tokenVersion (if used) so stale JWTs are invalidated.
    #    Not strictly required—new login still works—but ensures cleanliness.
    bump = await db.users.update_many(
        {"role": "donateur"},
        {"$inc": {"tokenVersion": 1}},
    )
    print(f"users with tokenVersion bumped: {bump.modified_count}")

    # 3. Sanity check
    remaining = await db.users.count_documents({"role": "donnateur"})
    print(f"remaining 'donnateur' users after migration: {remaining}")


if __name__ == "__main__":
    asyncio.run(run())
