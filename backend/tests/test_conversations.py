"""Phase 1 tests: direct-messaging datamodel + kernroutes (PRD_direct_messaging.md).

Enkel gesprek starten, berichten ophalen/versturen, als gelezen markeren —
geen bijlagen/blokkeren/verwijderen/notificaties in deze fase.
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
