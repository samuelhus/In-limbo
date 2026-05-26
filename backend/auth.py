"""Auth helpers: password hashing, JWT, dependency for current user."""
from __future__ import annotations
import os
from datetime import datetime, timezone, timedelta
from typing import Optional
import bcrypt
import jwt
from fastapi import HTTPException, Request, Depends


JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24 * 7  # 7 days session for simplicity (single token)
COOKIE_NAME = "il_token"


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])


def set_auth_cookie(response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=ACCESS_TOKEN_MINUTES * 60,
        path="/",
    )


def clear_auth_cookie(response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/", samesite="none", secure=True)


def get_token_from_request(request: Request) -> Optional[str]:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        return token
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


async def get_current_user_optional(request: Request) -> Optional[dict]:
    """Returns user dict if authenticated, else None."""
    from server import db  # late import to avoid cycle

    token = get_token_from_request(request)
    if not token:
        return None
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        return None
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        return None
    user.pop("passwordHash", None)
    return user


async def get_current_user(request: Request) -> dict:
    user = await get_current_user_optional(request)
    if not user:
        raise HTTPException(status_code=401, detail="Niet geauthenticeerd")
    return user


async def get_validated_user(user: dict = Depends(get_current_user)) -> dict:
    if user.get("status") != "validated":
        raise HTTPException(
            status_code=403,
            detail="Account is nog niet gevalideerd door een beheerder",
        )
    return user


async def get_admin_user(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin-toegang vereist")
    return user
