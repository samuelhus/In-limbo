"""Phase 1 + 2 tests: direct-messaging datamodel + kernroutes + bijlagen
(PRD_direct_messaging.md). Nog geen blokkeren/verwijderen/notificaties.
"""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    BASE_URL = "http://localhost:8001"

API = f"{BASE_URL}/api"

LOTTE = ("lotte@atelier-brussel.example", "User123!")
SAMIR = ("samir@vagebond.example", "User123!")


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
        return {"applicationId": application_id, "conversationId": c.json()["id"]}

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
        # 5 berichten met telkens 1 kleine bijlage — net binnen de limiet.
        for i in range(5):
            r = lotte.post(
                f"{API}/conversations/{conv['conversationId']}/messages",
                json={"text": f"bijlage {i}", "photos": [_attachment(1024)]},
            )
            assert r.status_code in (200, 201), r.text
        # 6de bijlage overschrijdt het maximum van 5 voor dit gesprek.
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
