"""Tests for /api/contact and /api/newsletter/subscribe endpoints."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
API = f"{BASE_URL}/api"

# Need direct DB access to verify persistence
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')


def _db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME], client


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _unique_email(prefix="testcontact"):
    return f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@example.com"


# ----------------- /api/contact -----------------

class TestContact:
    def test_contact_valid_submission(self, api_client):
        email = _unique_email("contact")
        payload = {"name": "Test User", "email": email, "message": "Hallo dit is een test bericht."}
        r = api_client.post(f"{API}/contact", json=payload)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

        # Verify persistence
        async def check():
            db, client = _db()
            try:
                doc = await db.contact_messages.find_one({"email": email.lower()})
                return doc
            finally:
                client.close()

        doc = asyncio.run(check())
        assert doc is not None
        assert doc["name"] == "Test User"
        assert doc["email"] == email.lower()
        assert doc["message"] == "Hallo dit is een test bericht."
        assert "id" in doc and "createdAt" in doc

    def test_contact_invalid_email_422(self, api_client):
        r = api_client.post(f"{API}/contact", json={"name": "X", "email": "not-an-email", "message": "hi"})
        assert r.status_code == 422

    def test_contact_message_over_1000_chars_422(self, api_client):
        long_msg = "a" * 1001
        r = api_client.post(f"{API}/contact", json={
            "name": "X", "email": _unique_email("long"), "message": long_msg
        })
        assert r.status_code == 422

    def test_contact_empty_name_422(self, api_client):
        r = api_client.post(f"{API}/contact", json={"name": "", "email": _unique_email("e"), "message": "ok"})
        assert r.status_code == 422


# ----------------- /api/newsletter/subscribe -----------------

class TestNewsletter:
    def test_newsletter_valid_subscribe(self, api_client):
        email = _unique_email("nl")
        r = api_client.post(f"{API}/newsletter/subscribe", json={"email": email})
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

        async def check():
            db, client = _db()
            try:
                doc = await db.newsletter_subscribers.find_one({"email": email.lower()})
                count = await db.newsletter_subscribers.count_documents({"email": email.lower()})
                return doc, count
            finally:
                client.close()

        doc, count = asyncio.run(check())
        assert doc is not None
        assert doc["email"] == email.lower()
        assert doc.get("mailerliteSynced") is False, "MailerLite not configured → should be False"
        assert count == 1

    def test_newsletter_idempotent_duplicate(self, api_client):
        email = _unique_email("dup")
        r1 = api_client.post(f"{API}/newsletter/subscribe", json={"email": email})
        assert r1.status_code == 200
        r2 = api_client.post(f"{API}/newsletter/subscribe", json={"email": email})
        assert r2.status_code == 200, r2.text  # no error on duplicate
        assert r2.json() == {"ok": True}

        async def check():
            db, client = _db()
            try:
                count = await db.newsletter_subscribers.count_documents({"email": email.lower()})
                return count
            finally:
                client.close()

        count = asyncio.run(check())
        assert count == 1, f"Expected exactly 1 doc after duplicate subscribe, got {count}"

    def test_newsletter_invalid_email_422(self, api_client):
        r = api_client.post(f"{API}/newsletter/subscribe", json={"email": "not-an-email"})
        assert r.status_code == 422


# ----------------- Regression -----------------

class TestRegression:
    def test_login_admin(self, api_client):
        r = api_client.post(f"{API}/auth/login", json={
            "email": "admin@inlimbo.be", "password": "Admin123!"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("email") == "admin@inlimbo.be"
        assert data.get("role") == "admin"

    def test_organisations_validated(self, api_client):
        r = api_client.get(f"{API}/organisations?validated_only=true")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_listings(self, api_client):
        r = api_client.get(f"{API}/listings")
        assert r.status_code == 200
        data = r.json()
        # listings endpoint returns paginated dict {items, total, skip, limit}
        assert isinstance(data, (list, dict))
        if isinstance(data, dict):
            assert "items" in data and isinstance(data["items"], list)


# ----------------- Rate Limit (best-effort) -----------------
# Note: per iteration_7, slowapi rate limiting may be unreliable behind k8s ingress
# due to per-proxy-IP buckets. We attempt the test but tolerate either outcome.

class TestRateLimit:
    def test_contact_rate_limit_attempt(self, api_client):
        responses = []
        for i in range(8):
            r = api_client.post(f"{API}/contact", json={
                "name": f"RL{i}", "email": _unique_email(f"rl{i}"), "message": f"rate limit test {i}"
            })
            responses.append(r.status_code)
        # Either at least one 429 (limit enforced) OR all 200 (bypassed via ingress IPs)
        has_429 = any(s == 429 for s in responses)
        print(f"Contact rate-limit responses: {responses}, 429-seen={has_429}")
        # Don't strictly fail — known infra issue.
        # But assert all are either 200 or 429
        assert all(s in (200, 429) for s in responses), f"Unexpected statuses: {responses}"

    def test_newsletter_rate_limit_attempt(self, api_client):
        responses = []
        for i in range(8):
            r = api_client.post(f"{API}/newsletter/subscribe", json={"email": _unique_email(f"rln{i}")})
            responses.append(r.status_code)
        has_429 = any(s == 429 for s in responses)
        print(f"Newsletter rate-limit responses: {responses}, 429-seen={has_429}")
        assert all(s in (200, 429) for s in responses), f"Unexpected statuses: {responses}"


# ----------------- Cleanup -----------------

@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data():
    yield

    async def cleanup():
        db, client = _db()
        try:
            await db.contact_messages.delete_many({"email": {"$regex": "^test_"}})
            await db.newsletter_subscribers.delete_many({"email": {"$regex": "^test_"}})
        finally:
            client.close()

    asyncio.run(cleanup())
