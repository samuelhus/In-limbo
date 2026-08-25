"""Regressietest voor POST /api/game/register (routes/game.py).

Bug: twee gelijktijdige registraties met dezelfde (case-insensitieve)
username gaven een 500 i.p.v. een 409. game_register deed een find_one-check
gevolgd door een insert_one zonder de DuplicateKeyError op die insert op te
vangen — anders dan swipe()/evaluate() in hetzelfde bestand, die deze
"insert, geen read-then-write"-race al wél afvangen (zie module-docstring
van routes/game.py). Wint de find_one-check de race niet, dan botst de
insert alsnog op de unique index (server.py) en gaf dat voorheen een
onafgevangen 500.
"""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor

import requests


def _read_env_url():
    val = os.environ.get("REACT_APP_BACKEND_URL")
    if val:
        return val
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except FileNotFoundError:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE = _read_env_url().rstrip("/") + "/api"


def _register(username, email):
    return requests.post(
        f"{BASE}/game/register",
        json={"username": username, "email": email, "consentAccepted": True},
        timeout=15,
    )


def test_concurrent_register_same_username_never_500s():
    # Unieke username per testrun, twee verschillende emails zodat elke
    # aanvraag hoe dan ook een "nieuwe speler"-poging is (geen match met een
    # reeds bestaand account) — precies het pad waar de race zich afspeelt.
    username = f"racer-{uuid.uuid4().hex[:10]}"

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(_register, username, f"racer1-{uuid.uuid4().hex[:6]}@example.com"),
            pool.submit(_register, username, f"racer2-{uuid.uuid4().hex[:6]}@example.com"),
        ]
        responses = [f.result() for f in futures]

    statuses = sorted(r.status_code for r in responses)
    assert 500 not in statuses, f"onverwachte 500: {[r.text for r in responses if r.status_code == 500]}"
    # Exact 1 winnaar (200, nieuw account); de verliezer krijgt 409 omdat de
    # username ondertussen bezet raakte (ofwel via de find_one-check, ofwel
    # via de DuplicateKeyError-afhandeling op de insert zelf).
    assert statuses == [200, 409], f"onverwachte statuscodes: {statuses}"


def test_register_duplicate_username_different_email_is_409_not_500():
    username = f"dup-{uuid.uuid4().hex[:10]}"
    first = _register(username, "eerste@example.com")
    assert first.status_code == 200, first.text

    # Zelfde username (andere casing, zoals de case-insensitieve collation
    # vereist), ander email-adres -> hoort altijd 409 te zijn, nooit 500.
    second = _register(username.upper(), "tweede@example.com")
    assert second.status_code == 409, second.text
