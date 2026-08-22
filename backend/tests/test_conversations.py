"""Phase 1 + 2 + 3 + 4 + 5 + 6 + 7 + 9 tests: direct-messaging datamodel +
kernroutes + bijlagen + blokkeren/verwijderen + in-app notificaties +
e-maildigest + de unread-count-route voor de "Berichten"-badge + de
gesprekslijst/-detail-routes voor de chat-UI + (fase 9) "afgehandeld",
bijlage-opruiming bij wederzijds verwijderen, en het naamformaat
(PRD_direct_messaging.md).
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    BASE_URL = "http://localhost:8001"

API = f"{BASE_URL}/api"

LOTTE = ("lotte@atelier-brussel.example", "User123!")
SAMIR = ("samir@vagebond.example", "User123!")

# Directe Mongo-toegang voor de e-maildigest-tests (fase 5): unreadSince/
# emailSentAt zijn bewust géén onderdeel van het publieke Conversation-
# contract (zie _serialize_conversation), dus enkel via de API te
# verifiëren is niet mogelijk — zelfde aanpak als test_contact_newsletter.py.
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

# backend/ zelf toevoegen aan sys.path zodat `import tasks` werkt ongeacht
# vanuit welke directory pytest gestart wordt (tests/ zelf staat er wel op).
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)
from tasks import send_message_email_reminders  # noqa: E402
from routes.conversations import _format_display_name  # noqa: E402


def _db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME], client


def _run(coro):
    """Voert een async DB-call/task synchroon uit vanuit een gewone pytest-testfunctie."""
    return asyncio.run(coro)


def _fetch_conversation(conv_id):
    async def _get():
        db, client = _db()
        try:
            return await db.conversations.find_one({"id": conv_id}, {"_id": 0})
        finally:
            client.close()
    return _run(_get())


def _set_conversation_fields(conv_id, fields):
    async def _set():
        db, client = _db()
        try:
            await db.conversations.update_one({"id": conv_id}, {"$set": fields})
        finally:
            client.close()
    return _run(_set())


def _unset_conversation_fields(conv_id, *field_names):
    """Simuleert een gesprek van vóór offererUserId een opgeslagen veld werd
    (zie routes/conversations.py::_get_or_backfill_offerer_id)."""
    async def _unset():
        db, client = _db()
        try:
            await db.conversations.update_one(
                {"id": conv_id}, {"$unset": {name: "" for name in field_names}},
            )
        finally:
            client.close()
    return _run(_unset())


def _session(creds=None):
    s = requests.Session()
    if creds:
        r = s.post(f"{API}/auth/login", json={"email": creds[0], "password": creds[1]}, timeout=15)
        assert r.status_code == 200, f"login {creds[0]} failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def lotte():
    return _session(LOTTE)


@pytest.fixture(scope="module")
def samir():
    return _session(SAMIR)


@pytest.fixture(scope="module")
def anon():
    return requests.Session()


@pytest.fixture(scope="module")
def test_listing(lotte, samir):
    """Verse listing van Lotte (aanbieder), met een aanvraag van Samir (aanvrager)
    — zelfde patroon als test_phase2_applications.py::test_listing."""
    payload = {
        "title": "TEST_conversations_listing",
        "description": "ephemeral test listing voor direct-messaging tests",
        "material": "Hout",
        "weight": 5.0,
        "photos": ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
        "isRecurrent": False,
        "deadline": "2026-12-31",
    }
    r = lotte.post(f"{API}/listings", json=payload)
    assert r.status_code in (200, 201), r.text
    listing_id = r.json()["id"]
    a = samir.post(f"{API}/listings/{listing_id}/apply", json={"motivation": "test conversation"})
    assert a.status_code in (200, 201), a.text
    return {"listingId": listing_id, "applicationId": a.json()["id"]}


@pytest.fixture(scope="module")
def make_conversation(lotte, samir):
    """Factory die telkens een verse listing + aanvraag + gesprek aanmaakt —
    i.t.t. test_listing (gedeeld over TestMessaging/TestReadReceipt) hebben
    de bijlage-limiet-tests elk hun eigen, geïsoleerde Conversation nodig
    zodat cumulatieve tellers elkaar niet beïnvloeden."""
    counter = {"n": 0}

    def _make():
        counter["n"] += 1
        payload = {
            "title": f"TEST_conversations_attachments_{counter['n']}",
            "description": "ephemeral test listing voor bijlage-tests",
            "material": "Hout",
            "weight": 5.0,
            "photos": ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
            "isRecurrent": False,
            "deadline": "2026-12-31",
        }
        r = lotte.post(f"{API}/listings", json=payload)
        assert r.status_code in (200, 201), r.text
        listing_id = r.json()["id"]
        a = samir.post(f"{API}/listings/{listing_id}/apply", json={"motivation": "test attachments"})
        assert a.status_code in (200, 201), a.text
        application_id = a.json()["id"]
        c = lotte.post(f"{API}/conversations", json={"applicationId": application_id})
        assert c.status_code in (200, 201), c.text
        return {
            "applicationId": application_id,
            "conversationId": c.json()["id"],
            "listingId": listing_id,
            "listingTitle": payload["title"],
        }

    return _make


def _attachment(n_bytes=1024, url="https://res.cloudinary.com/demo/image/upload/sample.jpg"):
    return {"url": url, "bytes": n_bytes}


# ---------- Gesprek starten ----------
class TestConversationCreate:
    def test_offerer_can_start_conversation(self, lotte, test_listing):
        r = lotte.post(f"{API}/conversations", json={"applicationId": test_listing["applicationId"]})
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data["applicationId"] == test_listing["applicationId"]
        assert data["listingId"] == test_listing["listingId"]
        assert data["offererUserId"]
        assert data["requesterUserId"]
        assert data["offererUserId"] != data["requesterUserId"]
        test_listing["conversationId"] = data["id"]

    def test_starting_again_is_idempotent(self, lotte, test_listing):
        r = lotte.post(f"{API}/conversations", json={"applicationId": test_listing["applicationId"]})
        assert r.status_code in (200, 201), r.text
        assert r.json()["id"] == test_listing["conversationId"]

    def test_requester_cannot_start_conversation(self, samir, test_listing):
        r = samir.post(f"{API}/conversations", json={"applicationId": test_listing["applicationId"]})
        assert r.status_code == 403, r.text

    def test_anonymous_401(self, anon, test_listing):
        r = anon.post(f"{API}/conversations", json={"applicationId": test_listing["applicationId"]})
        assert r.status_code == 401, r.text

    def test_unknown_application_404(self, lotte):
        r = lotte.post(f"{API}/conversations", json={"applicationId": "does-not-exist"})
        assert r.status_code == 404, r.text


# ---------- Berichten ----------
class TestMessaging:
    def test_requester_cannot_send_before_offerer(self, samir, test_listing):
        r = samir.post(
            f"{API}/conversations/{test_listing['conversationId']}/messages",
            json={"text": "Hallo, ik ben geïnteresseerd!"},
        )
        assert r.status_code == 403, r.text

    def test_offerer_sends_first_message(self, lotte, test_listing):
        r = lotte.post(
            f"{API}/conversations/{test_listing['conversationId']}/messages",
            json={"text": "Hoi! Hoe ga je het materiaal vervoeren?"},
        )
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data["conversationId"] == test_listing["conversationId"]
        assert data["text"] == "Hoi! Hoe ga je het materiaal vervoeren?"
        assert data["readAt"] is None

    def test_requester_can_now_reply(self, samir, test_listing):
        r = samir.post(
            f"{API}/conversations/{test_listing['conversationId']}/messages",
            json={"text": "Met een bestelwagen, volgende week vrijdag."},
        )
        assert r.status_code in (200, 201), r.text

    def test_messages_listed_in_order(self, lotte, test_listing):
        r = lotte.get(f"{API}/conversations/{test_listing['conversationId']}/messages")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 2
        texts = [m["text"] for m in data["items"]]
        assert texts == [
            "Hoi! Hoe ga je het materiaal vervoeren?",
            "Met een bestelwagen, volgende week vrijdag.",
        ]

    def test_empty_message_422(self, lotte, test_listing):
        r = lotte.post(f"{API}/conversations/{test_listing['conversationId']}/messages", json={"text": ""})
        assert r.status_code == 422, r.text

    def test_too_long_message_422(self, lotte, test_listing):
        r = lotte.post(
            f"{API}/conversations/{test_listing['conversationId']}/messages",
            json={"text": "x" * 2001},
        )
        assert r.status_code == 422, r.text

    def test_unrelated_user_forbidden(self, test_listing):
        # admin zit niet in dit gesprek — enkel offerer/requester mogen erbij
        s = _session(("admin@inlimbo.be", "Admin123!"))
        r_get = s.get(f"{API}/conversations/{test_listing['conversationId']}/messages")
        assert r_get.status_code == 403, r_get.text
        r_post = s.post(
            f"{API}/conversations/{test_listing['conversationId']}/messages",
            json={"text": "mag ik meepraten?"},
        )
        assert r_post.status_code == 403, r_post.text

    def test_unknown_conversation_404(self, lotte):
        r = lotte.get(f"{API}/conversations/does-not-exist/messages")
        assert r.status_code == 404, r.text


# ---------- Gesprekslijst & -detail (fase 7, PRD §6.3/§8) ----------
class TestConversationListAndDetail:
    def test_detail_and_mine_reflect_unread_and_listing_for_samir(self, samir, test_listing):
        # Hergebruikt bewust de 2 berichten die TestMessaging hierboven al
        # verstuurde — op dit punt in het bestand staan die nog ongelezen
        # (TestReadReceipt hieronder markeert ze pas als gelezen), dus dit
        # kost geen extra berichten op Lotte's gedeelde rate-limit-budget.
        detail = samir.get(f"{API}/conversations/{test_listing['conversationId']}")
        assert detail.status_code == 200, detail.text
        d = detail.json()
        assert d["listingTitle"]
        assert d["otherPartyName"]  # Lotte's naam/organisatie
        assert d["lastMessagePreview"] == "Met een bestelwagen, volgende week vrijdag."
        assert d["unreadCount"] == 1  # enkel Lotte's bericht is nog ongelezen voor Samir

        mine = samir.get(f"{API}/conversations/mine")
        assert mine.status_code == 200, mine.text
        entry = next(c for c in mine.json() if c["id"] == test_listing["conversationId"])
        assert entry["unreadCount"] == 1
        assert entry["listingTitle"]

    def test_detail_reflects_unread_for_offerer(self, lotte, test_listing):
        detail = lotte.get(f"{API}/conversations/{test_listing['conversationId']}")
        assert detail.status_code == 200, detail.text
        assert detail.json()["unreadCount"] == 1  # Samir's antwoord is nog ongelezen voor Lotte

    def test_hidden_conversation_excluded_from_mine(self, samir, make_conversation):
        conv = make_conversation()
        d = samir.delete(f"{API}/conversations/{conv['conversationId']}")
        assert d.status_code == 200, d.text
        mine = samir.get(f"{API}/conversations/mine")
        assert mine.status_code == 200, mine.text
        assert all(c["id"] != conv["conversationId"] for c in mine.json())

    def test_unrelated_user_cannot_get_detail(self, make_conversation):
        conv = make_conversation()
        s = _session(("admin@inlimbo.be", "Admin123!"))
        r = s.get(f"{API}/conversations/{conv['conversationId']}")
        assert r.status_code == 403, r.text

    def test_unknown_conversation_detail_404(self, lotte):
        r = lotte.get(f"{API}/conversations/does-not-exist")
        assert r.status_code == 404, r.text

    def test_anonymous_401(self, anon, make_conversation):
        conv = make_conversation()
        r = anon.get(f"{API}/conversations/{conv['conversationId']}")
        assert r.status_code == 401, r.text
        r2 = anon.get(f"{API}/conversations/mine")
        assert r2.status_code == 401, r2.text


# ---------- Gelezen markeren ----------
class TestReadReceipt:
    def test_requester_marks_read(self, lotte, samir, test_listing):
        r = samir.patch(f"{API}/conversations/{test_listing['conversationId']}/read")
        assert r.status_code == 200, r.text
        assert r.json()["modified"] == 1  # enkel Lotte's bericht was nog ongelezen voor Samir

        msgs = lotte.get(f"{API}/conversations/{test_listing['conversationId']}/messages").json()["items"]
        lotte_msg = next(m for m in msgs if m["text"].startswith("Hoi!"))
        samir_msg = next(m for m in msgs if m["text"].startswith("Met een bestelwagen"))
        assert lotte_msg["readAt"] is not None
        # Samir's eigen verstuurde bericht is niet "door Samir gelezen" —
        # readAt blijft leeg totdat Lotte op haar beurt leest.
        assert samir_msg["readAt"] is None

    def test_offerer_marks_read(self, lotte, samir, test_listing):
        r = lotte.patch(f"{API}/conversations/{test_listing['conversationId']}/read")
        assert r.status_code == 200, r.text
        assert r.json()["modified"] == 1

        msgs = samir.get(f"{API}/conversations/{test_listing['conversationId']}/messages").json()["items"]
        assert all(m["readAt"] is not None for m in msgs)

    def test_read_again_is_noop(self, lotte, test_listing):
        r = lotte.patch(f"{API}/conversations/{test_listing['conversationId']}/read")
        assert r.status_code == 200, r.text
        assert r.json()["modified"] == 0


# ---------- Bijlagen (fase 2, PRD §6.2) ----------
class TestAttachments:
    def test_message_with_attachment_succeeds(self, lotte, make_conversation):
        conv = make_conversation()
        r = lotte.post(
            f"{API}/conversations/{conv['conversationId']}/messages",
            json={"text": "Hier een foto van de staat.", "photos": [_attachment(500_000)]},
        )
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert len(data["photos"]) == 1
        assert data["photos"][0]["bytes"] == 500_000
        assert data["files"] == []

    def test_requester_can_send_attachment_after_offerer_first_message(self, lotte, samir, make_conversation):
        conv = make_conversation()
        r0 = lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "start"})
        assert r0.status_code in (200, 201), r0.text
        r = samir.post(
            f"{API}/conversations/{conv['conversationId']}/messages",
            json={"text": "hier is een foto van mijn kant", "photos": [_attachment(2048)]},
        )
        assert r.status_code in (200, 201), r.text
        assert r.json()["photos"][0]["bytes"] == 2048

    def test_conversation_totals_updated_cumulatively(self, lotte, make_conversation):
        conv = make_conversation()
        r1 = lotte.post(
            f"{API}/conversations/{conv['conversationId']}/messages",
            json={"text": "eerste", "photos": [_attachment(1000)]},
        )
        assert r1.status_code in (200, 201), r1.text
        r2 = lotte.post(
            f"{API}/conversations/{conv['conversationId']}/messages",
            json={"text": "tweede", "photos": [_attachment(2000)]},
        )
        assert r2.status_code in (200, 201), r2.text

        # POST /conversations is idempotent (zie TestConversationCreate) — dus
        # herbruikbaar om de lopende Conversation-totalen te inspecteren.
        again = lotte.post(f"{API}/conversations", json={"applicationId": conv["applicationId"]})
        assert again.status_code in (200, 201), again.text
        data = again.json()
        assert data["attachmentCount"] == 2
        assert data["attachmentBytes"] == 3000

    def test_attachment_count_limit_exceeded_413(self, lotte, make_conversation):
        conv = make_conversation()
        # Simuleer rechtstreeks in Mongo dat dit gesprek al op de limiet zit
        # (5 bijlagen), i.p.v. daar via 5 losse berichten naartoe te bouwen —
        # dat zou nodeloos zwaar wegen op de gedeelde bericht-rate-limit van
        # dit testbestand (zie ook TestEmailDigest verderop). Dat elke
        # bijlage tot en met de 5de gewoon aanvaard wordt, dekt
        # test_conversation_totals_updated_cumulatively hierboven al.
        _set_conversation_fields(conv["conversationId"], {"attachmentCount": 5, "attachmentBytes": 5 * 1024})
        r = lotte.post(
            f"{API}/conversations/{conv['conversationId']}/messages",
            json={"text": "te veel", "photos": [_attachment(1024)]},
        )
        assert r.status_code == 413, r.text
        assert "e-mail" in r.text.lower()

    def test_attachment_bytes_limit_exceeded_413(self, lotte, make_conversation):
        conv = make_conversation()
        r1 = lotte.post(
            f"{API}/conversations/{conv['conversationId']}/messages",
            json={
                "text": "groot bestand",
                "files": [_attachment(15 * 1024 * 1024, "https://res.cloudinary.com/demo/raw/upload/sample.pdf")],
            },
        )
        assert r1.status_code in (200, 201), r1.text
        # Nog eens 6 MB erbij (totaal 21 MB) overschrijdt de 20 MB-limiet,
        # ook al blijft het aantal bijlagen (2) ruim onder de max van 5.
        r2 = lotte.post(
            f"{API}/conversations/{conv['conversationId']}/messages",
            json={
                "text": "nog een groot bestand",
                "files": [_attachment(6 * 1024 * 1024, "https://res.cloudinary.com/demo/raw/upload/sample2.pdf")],
            },
        )
        assert r2.status_code == 413, r2.text

    def test_too_many_attachments_in_one_message_422(self, lotte, make_conversation):
        conv = make_conversation()
        r = lotte.post(
            f"{API}/conversations/{conv['conversationId']}/messages",
            json={"text": "te veel in 1 bericht", "photos": [_attachment(100) for _ in range(6)]},
        )
        assert r.status_code == 422, r.text

    def test_single_attachment_over_20mb_422(self, lotte, make_conversation):
        conv = make_conversation()
        r = lotte.post(
            f"{API}/conversations/{conv['conversationId']}/messages",
            json={"text": "te groot", "photos": [_attachment(21 * 1024 * 1024)]},
        )
        assert r.status_code == 422, r.text


# ---------- Blokkeren (fase 3, PRD §6.4) ----------
class TestBlocking:
    def test_block_prevents_blocked_party_from_sending(self, lotte, samir, make_conversation):
        conv = make_conversation()
        r0 = lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "start"})
        assert r0.status_code in (200, 201), r0.text
        r1 = samir.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "reply"})
        assert r1.status_code in (200, 201), r1.text

        rb = samir.patch(f"{API}/conversations/{conv['conversationId']}/block")
        assert rb.status_code == 200, rb.text
        data = rb.json()
        assert data["blockedByMe"] is True
        assert data["blockedByOther"] is False

        # Lotte is geblokkeerd door Samir en kan niet meer versturen.
        rl = lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "mag ik nog?"})
        assert rl.status_code == 403, rl.text

        # Samir (de blokkerende partij) kan zelf nog gewoon versturen — de
        # PRD beperkt enkel de geblokkeerde partij, geen wederzijdse opschorting.
        rs = samir.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "ik blokkeer wel"})
        assert rs.status_code in (200, 201), rs.text

        # Bestaande geschiedenis blijft zichtbaar voor beide partijen.
        rg = lotte.get(f"{API}/conversations/{conv['conversationId']}/messages")
        assert rg.status_code == 200, rg.text
        assert rg.json()["total"] == 3

    def test_blockedByOther_from_blocked_partys_perspective(self, lotte, samir, make_conversation):
        # Blokkeren staat los van eerder berichtenverkeer — geen bericht
        # nodig om dit te kunnen testen (spaart ook lotte's rate-limit-
        # budget, gedeeld over de hele testmodule).
        conv = make_conversation()
        samir.patch(f"{API}/conversations/{conv['conversationId']}/block")

        # /unblock is hier een no-op (Lotte werd nooit geblokkeerd door
        # zichzelf) — enkel gebruikt om Lotte's kant van de gederiveerde
        # blocked-status te inspecteren, analoog aan hoe fase 2 de
        # idempotente POST /conversations hergebruikt om totalen te checken.
        r = lotte.patch(f"{API}/conversations/{conv['conversationId']}/unblock")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["blockedByOther"] is True
        assert data["blockedByMe"] is False

    def test_unblock_lifts_the_block(self, lotte, samir, make_conversation):
        conv = make_conversation()
        samir.patch(f"{API}/conversations/{conv['conversationId']}/block")

        ru = samir.patch(f"{API}/conversations/{conv['conversationId']}/unblock")
        assert ru.status_code == 200, ru.text
        assert ru.json()["blockedByMe"] is False

        # Lotte is aanbieder en mag ook als allereerste in dit verse gesprek
        # versturen (geen asymmetrie-beperking voor die rol) — bevestigt dat
        # de opgeheven blokkade het versturen niet langer tegenhoudt.
        rl = lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "terug in gesprek"})
        assert rl.status_code in (200, 201), rl.text

    def test_blocked_party_cannot_unblock_themselves(self, lotte, samir, make_conversation):
        conv = make_conversation()
        samir.patch(f"{API}/conversations/{conv['conversationId']}/block")

        # Lotte werd geblokkeerd, maar is niet degene die blokkeerde — haar
        # eigen /unblock-aanroep raakt enkel haar eigen (niet-aanwezige)
        # entry en verandert dus niets aan de blokkade.
        lotte.patch(f"{API}/conversations/{conv['conversationId']}/unblock")
        r = lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "nog steeds geblokkeerd?"})
        assert r.status_code == 403, r.text

    def test_block_is_idempotent(self, samir, make_conversation):
        conv = make_conversation()
        r1 = samir.patch(f"{API}/conversations/{conv['conversationId']}/block")
        r2 = samir.patch(f"{API}/conversations/{conv['conversationId']}/block")
        assert r1.status_code == 200 and r2.status_code == 200
        assert r2.json()["blockedByMe"] is True

    def test_unrelated_user_cannot_block(self, make_conversation):
        conv = make_conversation()
        s = _session(("admin@inlimbo.be", "Admin123!"))
        r = s.patch(f"{API}/conversations/{conv['conversationId']}/block")
        assert r.status_code == 403, r.text

    def test_anonymous_cannot_block(self, anon, make_conversation):
        conv = make_conversation()
        r = anon.patch(f"{API}/conversations/{conv['conversationId']}/block")
        assert r.status_code == 401, r.text

    def test_unknown_conversation_block_404(self, lotte):
        r = lotte.patch(f"{API}/conversations/does-not-exist/block")
        assert r.status_code == 404, r.text


# ---------- Verwijderen/archiveren (fase 3, PRD §6.5) ----------
class TestDeleteHide:
    def test_delete_hides_and_reappears_on_new_message(self, lotte, samir, make_conversation):
        # Verbergen staat los van eerder berichtenverkeer — geen bericht
        # nodig vóór de DELETE zelf (spaart lotte's rate-limit-budget).
        conv = make_conversation()
        rd = samir.delete(f"{API}/conversations/{conv['conversationId']}")
        assert rd.status_code == 200, rd.text
        assert rd.json()["success"] is True

        # Inspectie via /unblock (no-op qua blokkering — Samir blokkeerde
        # niets — maar geeft wel de actuele hiddenByMe-status terug).
        r_hidden = samir.patch(f"{API}/conversations/{conv['conversationId']}/unblock")
        assert r_hidden.status_code == 200, r_hidden.text
        assert r_hidden.json()["hiddenByMe"] is True

        # Een nieuw bericht van Lotte (aanbieder, mag als allereerste
        # versturen) laat het gesprek terugkeren bij Samir.
        r1 = lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "hallo terug"})
        assert r1.status_code in (200, 201), r1.text

        r_visible = samir.patch(f"{API}/conversations/{conv['conversationId']}/unblock")
        assert r_visible.status_code == 200, r_visible.text
        assert r_visible.json()["hiddenByMe"] is False

    def test_delete_does_not_hide_for_other_party(self, lotte, samir, make_conversation):
        conv = make_conversation()
        rd = lotte.delete(f"{API}/conversations/{conv['conversationId']}")
        assert rd.status_code == 200, rd.text

        r_other = samir.patch(f"{API}/conversations/{conv['conversationId']}/unblock")
        assert r_other.status_code == 200, r_other.text
        assert r_other.json()["hiddenByMe"] is False  # Samir heeft zelf niets verwijderd

    def test_delete_does_not_block_messaging(self, lotte, samir, make_conversation):
        """Verwijderen is enkel zichtbaarheid, geen blokkade — beide partijen
        kunnen na een DELETE gewoon verder berichten (PRD §6.5)."""
        conv = make_conversation()
        lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "start"})
        samir.delete(f"{API}/conversations/{conv['conversationId']}")

        r = samir.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "nog steeds actief"})
        assert r.status_code in (200, 201), r.text

    def test_unknown_conversation_delete_404(self, lotte):
        r = lotte.delete(f"{API}/conversations/does-not-exist")
        assert r.status_code == 404, r.text

    def test_unrelated_user_cannot_delete(self, make_conversation):
        conv = make_conversation()
        s = _session(("admin@inlimbo.be", "Admin123!"))
        r = s.delete(f"{API}/conversations/{conv['conversationId']}")
        assert r.status_code == 403, r.text

    def test_anonymous_cannot_delete(self, anon, make_conversation):
        conv = make_conversation()
        r = anon.delete(f"{API}/conversations/{conv['conversationId']}")
        assert r.status_code == 401, r.text


# ---------- Gesprek overleeft een verwijderde listing ----------
# delete_listing (routes/listings.py) verwijdert een listing + haar
# applications hard, maar laat het gesprek bewust bestaan als
# berichtenhistoriek. offererUserId wordt daarom als momentopname op het
# Conversation-document opgeslagen (zie models.py) i.p.v. steeds live
# afgeleid uit Listing.userId — anders gaf _load_conversation hier voor
# iedereen 404 zodra de listing weg was.
class TestConversationSurvivesListingDeletion:
    def test_still_viewable_and_deletable_after_listing_deleted(self, lotte, samir, make_conversation):
        conv = make_conversation()
        r_msg = lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "hallo"})
        assert r_msg.status_code in (200, 201), r_msg.text

        r_del_listing = lotte.delete(f"{API}/listings/{conv['listingId']}")
        assert r_del_listing.status_code == 200, r_del_listing.text

        for user in (lotte, samir):
            r_detail = user.get(f"{API}/conversations/{conv['conversationId']}")
            assert r_detail.status_code == 200, r_detail.text
            assert r_detail.json()["listingTitle"] is None

            r_messages = user.get(f"{API}/conversations/{conv['conversationId']}/messages")
            assert r_messages.status_code == 200, r_messages.text
            assert r_messages.json()["total"] >= 1

        r_hide = samir.delete(f"{API}/conversations/{conv['conversationId']}")
        assert r_hide.status_code == 200, r_hide.text
        assert r_hide.json()["success"] is True

    def test_appears_in_offerer_conversation_list_after_listing_deleted(self, lotte, samir, make_conversation):
        conv = make_conversation()
        lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "hallo"})
        lotte.delete(f"{API}/listings/{conv['listingId']}")

        r_mine = lotte.get(f"{API}/conversations/mine")
        assert r_mine.status_code == 200, r_mine.text
        assert conv["conversationId"] in {c["id"] for c in r_mine.json()}

    def test_legacy_conversation_without_stored_offerer_id_still_recoverable(self, lotte, samir, make_conversation):
        """Gesprekken van vóór offererUserId een opgeslagen veld werd, vallen
        terug op de afzender van het eerste bericht (de aanbieder moet er
        per PRD §3 altijd als eerste een sturen) — zie
        _get_or_backfill_offerer_id."""
        conv = make_conversation()
        lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "hallo"})
        lotte.delete(f"{API}/listings/{conv['listingId']}")
        _unset_conversation_fields(conv["conversationId"], "offererUserId")

        lotte_id = lotte.get(f"{API}/auth/me").json()["id"]

        r_detail = lotte.get(f"{API}/conversations/{conv['conversationId']}")
        assert r_detail.status_code == 200, r_detail.text
        assert r_detail.json()["offererUserId"] == lotte_id

        # De backfill schrijft het opgeloste offererUserId (afgeleid uit het
        # eerste bericht, van Lotte) terug op het document, zodat een
        # volgende aanroep dit niet moet herhalen.
        backfilled = _fetch_conversation(conv["conversationId"])
        assert backfilled["offererUserId"] == lotte_id, backfilled

        r_hide = samir.delete(f"{API}/conversations/{conv['conversationId']}")
        assert r_hide.status_code == 200, r_hide.text


# De in-app notificatie bij een nieuw bericht (fase 4, PRD §6.6) — met de
# bijhorende TestMessageNotifications hier — is in fase 10 op vraag van
# product weer geschrapt: dubbele alert naast de al bestaande ongelezen-
# badge op de "Berichten"-tab (zie de module-docstring van
# routes/conversations.py, "Fase 10").

# ---------- E-maildigest (fase 5, PRD §6.6) ----------
# unreadSince/emailSentAt zijn bewust géén onderdeel van het publieke
# Conversation-contract (zie _serialize_conversation), dus deze tests lezen
# ze rechtstreeks uit Mongo (_fetch_conversation/_set_conversation_fields
# hierboven) — zelfde aanpak als test_contact_newsletter.py.
def _run_email_digest(delay):
    async def _job():
        db, client = _db()
        try:
            return await send_message_email_reminders(db, delay=delay)
        finally:
            client.close()
    return _run(_job())


class TestEmailDigest:
    def test_unread_since_set_once_per_burst_and_reset_on_read(self, lotte, samir, make_conversation):
        conv = make_conversation()
        r0 = lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "eerste"})
        assert r0.status_code in (200, 201), r0.text

        doc = _fetch_conversation(conv["conversationId"])
        first_unread_since = doc["requesterUnreadSince"]
        assert first_unread_since is not None
        # Lotte is zelf de verzender — voor haar start geen ongelezen-periode.
        assert doc["offererUnreadSince"] is None

        # Een 2de bericht in dezelfde burst mag unreadSince niet vooruitschuiven
        # (anders zou de 30-min-klok telkens herstarten en nooit aflopen).
        r1 = lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "tweede"})
        assert r1.status_code in (200, 201), r1.text
        doc2 = _fetch_conversation(conv["conversationId"])
        assert doc2["requesterUnreadSince"] == first_unread_since

        # Lezen sluit de ongelezen-periode af.
        rr = samir.patch(f"{API}/conversations/{conv['conversationId']}/read")
        assert rr.status_code == 200, rr.text
        doc3 = _fetch_conversation(conv["conversationId"])
        assert doc3["requesterUnreadSince"] is None

    def test_digest_email_sent_once_for_old_unread_period(self, lotte, samir, make_conversation):
        conv = make_conversation()
        r0 = lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "bericht 1"})
        assert r0.status_code in (200, 201), r0.text
        r1 = lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "bericht 2"})
        assert r1.status_code in (200, 201), r1.text

        # Simuleer dat deze ongelezen-periode al 40 min oud is (i.p.v. écht
        # 40 min wachten) — de job gebruikt hier gewoon de productie-default
        # van 30 min, ongewijzigd.
        backdated = (datetime.now(timezone.utc) - timedelta(minutes=40)).isoformat()
        _set_conversation_fields(conv["conversationId"], {"requesterUnreadSince": backdated})

        sent = _run_email_digest(timedelta(minutes=30))
        assert sent >= 1

        doc = _fetch_conversation(conv["conversationId"])
        assert doc["requesterEmailSentAt"] is not None
        assert doc["requesterEmailSentAt"] >= backdated
        first_sent_at = doc["requesterEmailSentAt"]

        # Nog een run: geen 2de mail voor dezelfde ongelezen-periode.
        _run_email_digest(timedelta(minutes=30))
        doc2 = _fetch_conversation(conv["conversationId"])
        assert doc2["requesterEmailSentAt"] == first_sent_at

    def test_digest_respects_delay_and_supports_short_override_for_testing(self, lotte, samir, make_conversation):
        conv = make_conversation()
        r0 = lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "recent bericht"})
        assert r0.status_code in (200, 201), r0.text

        # Slechts ~90 sec oud — ver onder de productie-default van 30 min.
        backdated = (datetime.now(timezone.utc) - timedelta(seconds=90)).isoformat()
        _set_conversation_fields(conv["conversationId"], {"requesterUnreadSince": backdated})

        # Met de echte 30-min-default is dit nog niet oud genoeg.
        _run_email_digest(timedelta(minutes=30))
        doc = _fetch_conversation(conv["conversationId"])
        assert doc["requesterEmailSentAt"] is None

        # PRD-voorstel: test met een kortere, tijdelijke vertraging (bv. 1
        # min) om het gedrag snel te verifiëren zonder echt te wachten — de
        # effectief geregistreerde job in server.py blijft op 30 min staan.
        _run_email_digest(timedelta(minutes=1))
        doc2 = _fetch_conversation(conv["conversationId"])
        assert doc2["requesterEmailSentAt"] is not None

    def test_digest_skips_already_read_conversation(self, lotte, samir, make_conversation):
        conv = make_conversation()
        r0 = lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "gelezen bericht"})
        assert r0.status_code in (200, 201), r0.text
        rr = samir.patch(f"{API}/conversations/{conv['conversationId']}/read")
        assert rr.status_code == 200, rr.text

        doc = _fetch_conversation(conv["conversationId"])
        assert doc["requesterUnreadSince"] is None

        # De 30-min-default zou dit gesprek sowieso nog niet oppikken (te
        # recent), maar het punt hier is dat unreadSince door het lezen al
        # None is — "is het gesprek intussen gelezen?" hoeft de job dus niet
        # apart te checken, zie tasks.py::send_message_email_reminders.
        _run_email_digest(timedelta(minutes=30))
        doc2 = _fetch_conversation(conv["conversationId"])
        assert doc2["requesterEmailSentAt"] is None


# ---------- Berichten-badge (fase 6, PRD §6.3) ----------
class TestUnreadCount:
    def test_counts_conversations_not_messages_read_and_hidden(self, lotte, samir, make_conversation):
        """Combineert alle badge-scenario's in 1 gesprek/2 berichten i.p.v.
        aparte tests — spaart lotte's gedeelde rate-limit-budget in dit
        testbestand (zelfde overweging als TestDeleteHide hierboven)."""
        conv = make_conversation()
        samir_before = samir.get(f"{API}/conversations/unread-count").json()["count"]
        lotte_before = lotte.get(f"{API}/conversations/unread-count").json()["count"]

        r0 = lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "eerste"})
        assert r0.status_code in (200, 201), r0.text
        r1 = lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "tweede"})
        assert r1.status_code in (200, 201), r1.text

        # Twee ongelezen berichten in hetzelfde gesprek tellen als 1 gesprek
        # (PRD §6.3: "aantal gesprekken", niet het totaal aantal berichten).
        assert samir.get(f"{API}/conversations/unread-count").json()["count"] == samir_before + 1
        # De verzender zelf heeft geen ongelezen berichten van zichzelf.
        assert lotte.get(f"{API}/conversations/unread-count").json()["count"] == lotte_before

        # Verbergen (PRD §6.5) sluit een bewust weggeborgen, reeds ongelezen
        # gesprek uit van de badge (het mechanisme dat het bij een nieuw
        # bericht terugkeert is al gedekt in TestDeleteHide hierboven).
        d = samir.delete(f"{API}/conversations/{conv['conversationId']}")
        assert d.status_code == 200, d.text
        assert samir.get(f"{API}/conversations/unread-count").json()["count"] == samir_before

    def test_anonymous_401(self, anon):
        r = anon.get(f"{API}/conversations/unread-count")
        assert r.status_code == 401, r.text


# ---------- "Afgehandeld" (fase 9) — los van hiddenBy/verwijderen ----------
class TestHandled:
    def test_mark_and_unmark_handled(self, samir, make_conversation):
        conv = make_conversation()
        r = samir.patch(f"{API}/conversations/{conv['conversationId']}/mark-handled")
        assert r.status_code == 200, r.text
        assert r.json()["handledByMe"] is True

        detail = samir.get(f"{API}/conversations/{conv['conversationId']}")
        assert detail.json()["handledByMe"] is True

        r2 = samir.patch(f"{API}/conversations/{conv['conversationId']}/unmark-handled")
        assert r2.status_code == 200, r2.text
        assert r2.json()["handledByMe"] is False

    def test_handled_is_independent_per_party(self, lotte, samir, make_conversation):
        conv = make_conversation()
        r = samir.patch(f"{API}/conversations/{conv['conversationId']}/mark-handled")
        assert r.status_code == 200, r.text
        # Samir's eigen markering raakt Lotte's weergave van hetzelfde gesprek niet.
        lotte_view = lotte.get(f"{API}/conversations/{conv['conversationId']}")
        assert lotte_view.json()["handledByMe"] is False

    def test_new_message_clears_handled_for_recipient(self, lotte, samir, make_conversation):
        conv = make_conversation()
        r = samir.patch(f"{API}/conversations/{conv['conversationId']}/mark-handled")
        assert r.status_code == 200, r.text
        r0 = lotte.post(f"{API}/conversations/{conv['conversationId']}/messages", json={"text": "nog iets"})
        assert r0.status_code in (200, 201), r0.text
        # Nieuwe activiteit van Lotte zet het voor Samir terug op "in behandeling".
        detail = samir.get(f"{API}/conversations/{conv['conversationId']}")
        assert detail.json()["handledByMe"] is False

    def test_anonymous_401(self, anon, make_conversation):
        conv = make_conversation()
        r = anon.patch(f"{API}/conversations/{conv['conversationId']}/mark-handled")
        assert r.status_code == 401, r.text


# ---------- Bijlage-opruiming bij wederzijds verwijderen (fase 9, PRD §6.5) ----------
class TestMutualDeletePurgesAttachments:
    def test_attachments_cleared_only_after_both_parties_delete(self, lotte, samir, make_conversation):
        conv = make_conversation()
        r0 = lotte.post(
            f"{API}/conversations/{conv['conversationId']}/messages",
            json={"text": "met foto", "photos": [_attachment(1000)]},
        )
        assert r0.status_code in (200, 201), r0.text
        message_id = r0.json()["id"]

        d1 = lotte.delete(f"{API}/conversations/{conv['conversationId']}")
        assert d1.status_code == 200, d1.text
        # Nog maar 1 partij heeft verwijderd — bijlage blijft intact voor Samir.
        msgs = samir.get(f"{API}/conversations/{conv['conversationId']}/messages").json()["items"]
        assert next(m for m in msgs if m["id"] == message_id)["photos"] != []

        d2 = samir.delete(f"{API}/conversations/{conv['conversationId']}")
        assert d2.status_code == 200, d2.text
        # Beide partijen hebben nu verwijderd — de bijlage-referentie is weg
        # (en de effectieve Cloudinary-destroy-call is een best-effort side-
        # effect die hier niet apart getest wordt — geen echte credentials
        # voor de fictieve demo-URL uit _attachment() in een testomgeving).
        msgs2 = samir.get(f"{API}/conversations/{conv['conversationId']}/messages").json()["items"]
        assert next(m for m in msgs2 if m["id"] == message_id)["photos"] == []

        again = lotte.post(f"{API}/conversations", json={"applicationId": conv["applicationId"]})
        assert again.status_code in (200, 201), again.text
        assert again.json()["attachmentCount"] == 0
        assert again.json()["attachmentBytes"] == 0


# ---------- Naamformaat (fase 9): "Voornaam van Organisatienaam" ----------
class TestDisplayNameFormat:
    """_format_display_name is een pure functie (geen DB/HTTP nodig) — zelfde
    aanpak als send_message_email_reminders hierboven, rechtstreeks
    geïmporteerd i.p.v. via de API elke tak apart op te zetten."""

    def test_org_member(self):
        assert _format_display_name(
            {"firstName": "Lotte", "role": "user"}, {"name": "Atelier Brussel"},
        ) == "Lotte van Atelier Brussel"

    def test_org_without_first_name_falls_back_to_org_name(self):
        assert _format_display_name(
            {"firstName": None, "role": "user"}, {"name": "Atelier Brussel"},
        ) == "Atelier Brussel"

    def test_donateur_bedrijf(self):
        user = {"firstName": "Kim", "role": "donateur", "donorType": "bedrijf", "companyName": "Kringwinkel Molenbeek"}
        assert _format_display_name(user, None) == "Kim van Kringwinkel Molenbeek"

    def test_donateur_particulier_uses_username(self):
        user = {"firstName": "Dana", "role": "donateur", "donorType": "particulier", "username": "dana_doneert"}
        assert _format_display_name(user, None) == "dana_doneert"

    def test_fallback_first_and_last_name(self):
        user = {"firstName": "Jan", "lastName": "Peeters", "role": "user"}
        assert _format_display_name(user, None) == "Jan Peeters"

    def test_fallback_username_when_no_name_known(self):
        user = {"role": "user", "username": "anon"}
        assert _format_display_name(user, None) == "anon"

    def test_none_user_returns_none(self):
        assert _format_display_name(None, None) is None

    def test_via_api_reflects_org_membership(self, lotte, samir, test_listing):
        """Integratietest bovenop de unit-tests hierboven — controleert dat
        _enrich_conversations de functie ook effectief zo aanroept, met de
        echte seed-data van Lotte/Samir (backend/seed.py). Hergebruikt
        test_listing's al bestaande gesprek, geen nieuw bericht nodig."""
        as_samir = samir.get(f"{API}/conversations/{test_listing['conversationId']}")
        assert as_samir.json()["otherPartyName"] == "Lotte van Atelier Brussel"

        as_lotte = lotte.get(f"{API}/conversations/{test_listing['conversationId']}")
        assert as_lotte.json()["otherPartyName"] == "Samir van Theatergezelschap Vagebond"
        assert as_lotte.json()["viewerName"] == "Lotte van Atelier Brussel"
