"""Auth voor Schat of Schroot? (swipe-spel) — bewust een volledig losstaand
JWT-secret/cookie/scheme van het hoofdplatform (cf. prd/PRD_Schat_of_Schroot.md §3:
"volledig losstaand account-systeem"), zodat een spel-token nooit als platform-token
bruikbaar is en omgekeerd. Mirror van auth.py qua opbouw, met eigen naamgeving
overal (GAME_* i.p.v. de platformnamen) om verwarring tussen de twee te vermijden.
"""
from __future__ import annotations
import os
from datetime import datetime, timezone, timedelta
from typing import Optional
import jwt
from fastapi import HTTPException, Request, Depends


GAME_JWT_ALGORITHM = "HS256"
GAME_ACCESS_TOKEN_MINUTES = 60 * 24 * 30  # 30 dagen — casual spel, geen her-login-frictie
GAME_COOKIE_NAME = "il_game_token"


def _game_secret() -> str:
    # Los GAME_JWT_SECRET aanraden in productie (PRD §3), maar niet hard vereisen:
    # zonder deze env-var blijft de app werken door terug te vallen op JWT_SECRET
    # (nog steeds een apart token/cookie, enkel de ondertekeningssleutel wordt
    # gedeeld met het hoofdplatform totdat GAME_JWT_SECRET expliciet gezet wordt).
    secret = os.environ.get("GAME_JWT_SECRET")
    if secret:
        return secret
    from deps import log
    log.warning(
        "GAME_JWT_SECRET niet gezet — spel-tokens vallen terug op JWT_SECRET. "
        "Zet GAME_JWT_SECRET in .env voor een écht los secret (PRD §3)."
    )
    return os.environ["JWT_SECRET"]


def create_game_token(game_user_id: str, username: str) -> str:
    payload = {
        "sub": game_user_id,
        "username": username,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=GAME_ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, _game_secret(), algorithm=GAME_JWT_ALGORITHM)


def decode_game_token(token: str) -> dict:
    return jwt.decode(token, _game_secret(), algorithms=[GAME_JWT_ALGORITHM])


def set_game_auth_cookie(response, token: str) -> None:
    response.set_cookie(
        key=GAME_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=GAME_ACCESS_TOKEN_MINUTES * 60,
        path="/",
    )


def clear_game_auth_cookie(response) -> None:
    response.delete_cookie(key=GAME_COOKIE_NAME, path="/", samesite="none", secure=True)


def get_game_token_from_request(request: Request) -> Optional[str]:
    # Enkel de cookie — geen Authorization-header-fallback nodig zoals bij het
    # hoofdplatform: het spel heeft geen server-to-server/API-clients, enkel de
    # eigen browser-UI (frontend/src/contexts/GameAuthContext.jsx).
    return request.cookies.get(GAME_COOKIE_NAME)


async def get_current_game_user_optional(request: Request) -> Optional[dict]:
    from deps import db

    token = get_game_token_from_request(request)
    if not token:
        return None
    try:
        payload = decode_game_token(token)
    except jwt.PyJWTError:
        return None
    user = await db.game_users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user or user.get("anonymized"):
        return None
    return user


async def get_current_game_user(request: Request) -> dict:
    user = await get_current_game_user_optional(request)
    if not user:
        raise HTTPException(status_code=401, detail="Niet ingelogd in het spel")
    return user
