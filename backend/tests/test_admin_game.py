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
# Lotte (organisatie-eigenaar, zie backend/seed.py) dient hier dubbel: als
# "gewone gebruiker" voor de 403-checks, en als aanbieder om een listing aan
# te maken voor de evaluatie-tests hieronder.
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


@pytest.fixture(scope="module")
def lotte_session():
    return _login(NON_ADMIN_EMAIL, NON_ADMIN_PASS)


def _register_game_player_with_session(admin_session=None):
    """Registreert een verse, ephemere speler (eigen sessie, los van het
    hoofdplatform-account-systeem, zie routes/game.py::game_register) en geeft
    de ingelogde sessie mee terug — nodig om nadien als die speler te kunnen
    evalueren (POST /game/evaluate draait op de spel-cookie van deze sessie).

    `admin_session` (optioneel): stelt deze registratie vrij van de IP-rate-
    limit op POST /game/register (zie auth.py::is_admin_request en
    routes/game.py::_register_rate_limit_key) door de il_token-cookie van een
    ingelogde admin mee te sturen — anders lopen de vele registraties in deze
    testfile (allemaal vanaf hetzelfde test-IP, ruim binnen 1 minuut) zelf
    tegen die limiet aan."""
    s = requests.Session()
    if admin_session is not None:
        token = admin_session.cookies.get("il_token")
        if token:
            s.cookies.set("il_token", token)
    payload = {
        "username": f"TEST_speler_{uuid.uuid4().hex[:10]}",
        "email": f"test-{uuid.uuid4().hex[:10]}@inlimbo-test.example",
        "consentAccepted": True,
    }
    r = s.post(f"{BASE}/game/register", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    return s, r.json()["id"]


def _register_game_player(admin_session=None):
    _, player_id = _register_game_player_with_session(admin_session)
    return player_id


def _create_game_listing(lotte_session):
    """Verse listing van Lotte (aanbieder) — standaard status "beschikbaar",
    wat al genoeg is voor de spelpool (GAME_POOL_STATUSES, models.py) en dus
    voor POST /game/evaluate hieronder."""
    payload = {
        "title": f"TEST_admin_game_listing_{uuid.uuid4().hex[:10]}",
        "description": "ephemere test listing voor het admin-gamebeheer",
        "material": "Hout",
        "weight": 5.0,
        "photos": ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
        "isRecurrent": False,
        "deadline": "2026-12-31",
    }
    r = lotte_session.post(f"{BASE}/listings", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _submit_evaluation(player_session, listing_id, answer1="Wie kan dit gebruiken? test", answer2="Waarvoor? test"):
    r = player_session.post(
        f"{BASE}/game/evaluate",
        json={"listingId": listing_id, "answer1": answer1, "answer2": answer2},
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text
    return r.json()


class TestDeleteGamePlayer:
    def test_deleting_two_players_in_a_row_both_succeed(self, admin_session):
        """De kern van de regressie: vóór de fix gaf enkel de 2de verwijdering
        al een 500 (duplicate-key op de username-index bij username=None)."""
        player1 = _register_game_player(admin_session)
        player2 = _register_game_player(admin_session)

        r1 = admin_session.delete(f"{BASE}/admin/game/users/{player1}", timeout=15)
        assert r1.status_code == 200, r1.text
        assert r1.json()["ok"] is True

        r2 = admin_session.delete(f"{BASE}/admin/game/users/{player2}", timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json()["ok"] is True

    def test_deleted_player_shows_as_anonymized(self, admin_session):
        player_id = _register_game_player(admin_session)
        admin_session.delete(f"{BASE}/admin/game/users/{player_id}", timeout=15)

        users = admin_session.get(f"{BASE}/admin/game/users", timeout=15).json()
        row = next(u for u in users if u["id"] == player_id)
        assert row["anonymized"] is True
        assert row["username"] is None

    def test_unknown_player_404(self, admin_session):
        r = admin_session.delete(f"{BASE}/admin/game/users/does-not-exist", timeout=15)
        assert r.status_code == 404, r.text

    def test_non_admin_cannot_delete(self, admin_session, non_admin_session):
        player_id = _register_game_player(admin_session)
        r = non_admin_session.delete(f"{BASE}/admin/game/users/{player_id}", timeout=15)
        assert r.status_code == 403, r.text


# ---------- Evaluaties per listing bekijken/verwijderen (klik-door vanuit de
# Aanbiedingen-tab) + de validatiefunctie die daarbij geschrapt is ----------
class TestListingEvaluations:
    def test_lists_all_evaluations_with_username_and_email(self, admin_session, lotte_session):
        listing_id = _create_game_listing(lotte_session)
        s1, _ = _register_game_player_with_session(admin_session)
        s2, _ = _register_game_player_with_session(admin_session)
        _submit_evaluation(s1, listing_id)
        _submit_evaluation(s2, listing_id)

        r = admin_session.get(f"{BASE}/admin/game/listings/{listing_id}/evaluations", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["items"]) == 2
        for item in data["items"]:
            assert item["username"], item
            assert item["email"], item
            assert item["answer1"] and item["answer2"]

    def test_delete_evaluation_frees_up_the_cap_slot(self, admin_session, lotte_session):
        listing_id = _create_game_listing(lotte_session)
        s1, _ = _register_game_player_with_session(admin_session)
        s2, _ = _register_game_player_with_session(admin_session)
        _submit_evaluation(s1, listing_id)
        _submit_evaluation(s2, listing_id)

        evals_before = admin_session.get(f"{BASE}/admin/game/listings/{listing_id}/evaluations", timeout=15).json()
        to_delete = evals_before["items"][0]["id"]

        r = admin_session.delete(f"{BASE}/admin/game/evaluations/{to_delete}", timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

        evals_after = admin_session.get(f"{BASE}/admin/game/listings/{listing_id}/evaluations", timeout=15).json()
        assert len(evals_after["items"]) == 1
        assert all(item["id"] != to_delete for item in evals_after["items"])

        stats = admin_session.get(f"{BASE}/admin/game/listings-stats", timeout=15).json()
        row = next(l for l in stats if l["id"] == listing_id)
        assert row["gameEvaluationCount"] == 1  # was 2, -1 na het verwijderen

    def test_unknown_listing_404(self, admin_session):
        r = admin_session.get(f"{BASE}/admin/game/listings/does-not-exist/evaluations", timeout=15)
        assert r.status_code == 404, r.text

    def test_unknown_evaluation_delete_404(self, admin_session):
        r = admin_session.delete(f"{BASE}/admin/game/evaluations/does-not-exist", timeout=15)
        assert r.status_code == 404, r.text

    def test_non_admin_cannot_view_or_delete(self, admin_session, non_admin_session, lotte_session):
        listing_id = _create_game_listing(lotte_session)
        s1, _ = _register_game_player_with_session(admin_session)
        _submit_evaluation(s1, listing_id)
        # id via de admin-route opgehaald (die zelf al elders getest is) —
        # enkel om iets te hebben om de 403-check hieronder tegen te doen.
        eval_id = admin_session.get(
            f"{BASE}/admin/game/listings/{listing_id}/evaluations", timeout=15,
        ).json()["items"][0]["id"]

        r_get = non_admin_session.get(f"{BASE}/admin/game/listings/{listing_id}/evaluations", timeout=15)
        assert r_get.status_code == 403, r_get.text

        r_del = non_admin_session.delete(f"{BASE}/admin/game/evaluations/{eval_id}", timeout=15)
        assert r_del.status_code == 403, r_del.text

    def test_validate_route_no_longer_exists(self, admin_session):
        """Regressietest: de validatiefunctie is op vraag van product
        volledig geschrapt (route, model, UI-knop) — dit endpoint mag dus
        niet meer bestaan."""
        r = admin_session.post(
            f"{BASE}/admin/game/evaluations/does-not-exist/validate",
            json={"destinationOrgId": "does-not-exist"},
            timeout=15,
        )
        assert r.status_code == 404, r.text


# ---------- Top evaluaties: listingStatus + email erbij (voor de filter op
# beschikbaarheid en de admin-context bij het modereren) ----------
class TestTopEvaluations:
    def test_top_evaluations_include_listing_status_and_email(self, admin_session, lotte_session):
        listing_id = _create_game_listing(lotte_session)
        s1, _ = _register_game_player_with_session(admin_session)
        _submit_evaluation(s1, listing_id)

        # limit=200 (max toegelaten) zodat deze verse, 0-stemmen-evaluatie niet
        # toevallig net buiten de top valt op een gedeelde testdatabase met
        # veel bestaande evaluaties.
        r = admin_session.get(f"{BASE}/admin/game/evaluations/top", params={"limit": 200}, timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()
        row = next(e for e in rows if e["listingId"] == listing_id)
        assert row["listingStatus"] == "beschikbaar"
        assert row["email"]
