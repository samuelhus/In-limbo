"""Tests voor het admin-beheer van spelers in Schat of Schroot?
(routes/admin_game.py) — met de nadruk op DELETE /admin/game/users/{id}
(GDPR-anonimisering, deps.py::anonymize_game_user).

Regressietest voor een bug waarbij een 2de speler verwijderen een 500 gaf:
anonymize_game_user zet username op None, en de unique index op
game_users.username (server.py) had geen partialFilterExpression, dus meer
dan 1 speler tegelijk met username=None botste op een duplicate-key-fout.
"""
import os
import uuid

import requests
import pytest


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
ADMIN_EMAIL = "admin@inlimbo.be"
ADMIN_PASS = "Admin123!"
NON_ADMIN_EMAIL = "lotte@atelier-brussel.example"
NON_ADMIN_PASS = "User123!"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin_session():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def non_admin_session():
    return _login(NON_ADMIN_EMAIL, NON_ADMIN_PASS)


def _register_game_player():
    """Registreert een verse, ephemere speler (eigen sessie, los van het
    hoofdplatform-account-systeem, zie routes/game.py::game_register)."""
    s = requests.Session()
    payload = {
        "username": f"TEST_speler_{uuid.uuid4().hex[:10]}",
        "email": f"test-{uuid.uuid4().hex[:10]}@inlimbo-test.example",
        "consentAccepted": True,
    }
    r = s.post(f"{BASE}/game/register", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


class TestDeleteGamePlayer:
    def test_deleting_two_players_in_a_row_both_succeed(self, admin_session):
        """De kern van de regressie: vóór de fix gaf enkel de 2de verwijdering
        al een 500 (duplicate-key op de username-index bij username=None)."""
        player1 = _register_game_player()
        player2 = _register_game_player()

        r1 = admin_session.delete(f"{BASE}/admin/game/users/{player1}", timeout=15)
        assert r1.status_code == 200, r1.text
        assert r1.json()["ok"] is True

        r2 = admin_session.delete(f"{BASE}/admin/game/users/{player2}", timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json()["ok"] is True

    def test_deleted_player_shows_as_anonymized(self, admin_session):
        player_id = _register_game_player()
        admin_session.delete(f"{BASE}/admin/game/users/{player_id}", timeout=15)

        users = admin_session.get(f"{BASE}/admin/game/users", timeout=15).json()
        row = next(u for u in users if u["id"] == player_id)
        assert row["anonymized"] is True
        assert row["username"] is None

    def test_unknown_player_404(self, admin_session):
        r = admin_session.delete(f"{BASE}/admin/game/users/does-not-exist", timeout=15)
        assert r.status_code == 404, r.text

    def test_non_admin_cannot_delete(self, non_admin_session):
        player_id = _register_game_player()
        r = non_admin_session.delete(f"{BASE}/admin/game/users/{player_id}", timeout=15)
        assert r.status_code == 403, r.text
