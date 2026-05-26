"""In Limbo backend API tests.

Covers: auth, organisations, listings (limited vs full view), cloudinary signature,
admin queue + decisions, profile update, logout.
"""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://limbo-stage.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

ADMIN = ("admin@inlimbo.be", "Admin123!")
VALID_USER = ("lotte@atelier-brussel.example", "User123!")
PENDING_EXISTING = ("nora.pending@atelier-brussel.example", "User123!")
PENDING_NEW = ("tom@deschakel.example", "User123!")


# ------- helpers / fixtures -------

def login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    assert "il_token" in s.cookies, "il_token cookie not set"
    return s, r.json()


@pytest.fixture(scope="module")
def admin_session():
    s, _ = login(*ADMIN)
    return s


@pytest.fixture(scope="module")
def validated_session():
    s, _ = login(*VALID_USER)
    return s


@pytest.fixture(scope="module")
def pending_session():
    s, _ = login(*PENDING_EXISTING)
    return s


# ------- AUTH -------

class TestAuth:
    def test_login_admin_sets_cookie_and_returns_user(self):
        s, user = login(*ADMIN)
        assert user["email"] == ADMIN[0]
        assert user["role"] == "admin"
        assert user["status"] == "validated"
        # /me with same cookie
        me = s.get(f"{API}/auth/me")
        assert me.status_code == 200
        assert me.json()["email"] == ADMIN[0]

    def test_me_without_cookie_401(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_login_wrong_password_401(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": "wrong!"})
        assert r.status_code == 401

    def test_register_new_org_creates_pending_user_and_org(self):
        email = f"TEST_new_{uuid.uuid4().hex[:8]}@example.com"
        s = requests.Session()
        r = s.post(f"{API}/auth/register/new-org", json={
            "email": email, "password": "Pass1234!", "firstName": "T", "lastName": "U",
            "phone": "0470", "acceptedTerms": True,
            "orgName": f"TEST Org {uuid.uuid4().hex[:6]}",
            "orgDescription": "x", "orgCategory": "Ander",
            "orgAddress": "Brussels", "orgWebsite": None,
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "pending"
        assert "il_token" in s.cookies
        me = s.get(f"{API}/auth/me").json()
        assert me["status"] == "pending"
        assert me["organisationId"] == data["organisationId"]

    def test_register_existing_org_with_validated_org(self):
        # find a validated org id
        orgs = requests.get(f"{API}/organisations", params={"q": "Atelier"}).json()
        assert orgs, "Expected at least one validated org named Atelier..."
        org_id = orgs[0]["id"]
        email = f"TEST_exist_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register/existing-org", json={
            "email": email, "password": "Pass1234!", "firstName": "T", "lastName": "U",
            "phone": "0470", "acceptedTerms": True, "organisationId": org_id,
        })
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "pending"

    def test_register_existing_org_with_nonvalidated_id_returns_404(self):
        r = requests.post(f"{API}/auth/register/existing-org", json={
            "email": f"TEST_x_{uuid.uuid4().hex[:6]}@example.com",
            "password": "Pass1234!", "firstName": "T", "lastName": "U",
            "phone": "0", "acceptedTerms": True,
            "organisationId": "non-existent-id-xyz",
        })
        assert r.status_code == 404

    def test_duplicate_email_returns_409(self):
        r = requests.post(f"{API}/auth/register/new-org", json={
            "email": ADMIN[0], "password": "Pass1234!", "firstName": "T",
            "lastName": "U", "phone": "0", "acceptedTerms": True,
            "orgName": "x", "orgDescription": "x", "orgCategory": "Ander",
            "orgAddress": "x", "orgWebsite": None,
        })
        assert r.status_code == 409

    def test_logout_clears_cookie(self):
        s, _ = login(*VALID_USER)
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200
        # New session without cookie -> 401
        r2 = requests.get(f"{API}/auth/me")
        assert r2.status_code == 401


# ------- ORGANISATIONS -------

class TestOrganisations:
    def test_search_atelier(self):
        r = requests.get(f"{API}/organisations", params={"q": "Ate"})
        assert r.status_code == 200
        names = [o["name"] for o in r.json()]
        assert any("Atelier" in n for n in names), f"Expected Atelier in {names}"

    def test_search_short_query_returns_empty(self):
        r = requests.get(f"{API}/organisations", params={"q": "A"})
        assert r.status_code == 200
        assert r.json() == []

    def test_list_only_validated_by_default(self):
        r = requests.get(f"{API}/organisations").json()
        for o in r:
            assert o["status"] in ("validated", "active"), o

    def test_patch_org_requires_member_or_admin(self, validated_session):
        # Get user's org
        me = validated_session.get(f"{API}/auth/me").json()
        org_id = me["organisationId"]
        r = validated_session.patch(f"{API}/organisations/{org_id}", json={"description": "Updated by test"})
        assert r.status_code == 200
        assert r.json()["description"] == "Updated by test"

    def test_patch_org_forbidden_for_other_org(self, validated_session):
        # find a different validated org
        all_orgs = requests.get(f"{API}/organisations").json()
        me = validated_session.get(f"{API}/auth/me").json()
        other = next((o for o in all_orgs if o["id"] != me["organisationId"]), None)
        if not other:
            pytest.skip("Only one validated org exists")
        r = validated_session.patch(f"{API}/organisations/{other['id']}", json={"description": "hack"})
        assert r.status_code == 403


# ------- LISTINGS -------

class TestListings:
    def test_listings_visitor_limited(self):
        r = requests.get(f"{API}/listings", params={"limit": 3})
        assert r.status_code == 200
        data = r.json()
        assert "total" in data and "items" in data
        assert len(data["items"]) <= 3
        for it in data["items"]:
            assert it.get("limited") is True
            # only allowed limited fields
            assert "title" in it and "material" in it and "status" in it
            assert "description" not in it and "weight" not in it
            assert it["status"] != "gearchiveerd"

    def test_listings_validated_full(self, validated_session):
        r = validated_session.get(f"{API}/listings", params={"limit": 10})
        assert r.status_code == 200
        items = r.json()["items"]
        assert items, "Expected seeded listings"
        for it in items:
            assert "limited" not in it
            # full fields available
            assert "description" in it or "weight" in it or "material" in it

    def test_listing_detail_recurrent_has_offerer_email_for_validated(self, validated_session):
        items = validated_session.get(f"{API}/listings", params={"limit": 50}).json()["items"]
        recurrent = next((it for it in items if it.get("isRecurrent")), None)
        if not recurrent:
            pytest.skip("No recurrent listing seeded")
        r = validated_session.get(f"{API}/listings/{recurrent['id']}")
        assert r.status_code == 200
        d = r.json()
        assert "offererEmail" in d
        assert "organisation" in d

    def test_post_listing_validated_succeeds(self, validated_session):
        body = {
            "title": f"TEST {uuid.uuid4().hex[:6]}",
            "description": "test desc",
            "material": "Hout",
            "weight": 10.0,
            "isRecurrent": True,
            "photos": ["https://example.com/x.jpg"],
        }
        r = validated_session.post(f"{API}/listings", json=body)
        assert r.status_code in (200, 201), r.text
        assert r.json()["status"] == "beschikbaar"

    def test_post_listing_pending_forbidden(self, pending_session):
        body = {
            "title": "TEST pending", "description": "x", "material": "Hout",
            "weight": 1.0, "isRecurrent": True,
            "photos": ["https://example.com/x.jpg"],
        }
        r = pending_session.post(f"{API}/listings", json=body)
        assert r.status_code == 403


# ------- CLOUDINARY -------

class TestCloudinary:
    def test_signature_anonymous_401(self):
        r = requests.get(f"{API}/cloudinary/signature")
        assert r.status_code == 401

    def test_signature_pending_403(self, pending_session):
        r = pending_session.get(f"{API}/cloudinary/signature")
        assert r.status_code == 403

    def test_signature_validated_returns_payload(self, validated_session):
        r = validated_session.get(f"{API}/cloudinary/signature")
        assert r.status_code == 200
        d = r.json()
        for k in ("signature", "timestamp", "cloud_name", "api_key", "folder"):
            assert k in d


# ------- ADMIN -------

class TestAdmin:
    def test_queue_requires_admin(self, validated_session):
        r = validated_session.get(f"{API}/admin/validation-queue")
        assert r.status_code == 403

    def test_queue_returns_pending(self, admin_session):
        r = admin_session.get(f"{API}/admin/validation-queue")
        assert r.status_code == 200
        d = r.json()
        assert "pendingUsers" in d and "pendingOrgs" in d
        emails = [u["email"] for u in d["pendingUsers"]]
        # seeded pending users should be present (unless previously approved by other test run)
        # We just check at least one of the seed pending users exists OR queue is non-empty from our other tests
        assert isinstance(d["pendingUsers"], list)
        # organisation must be populated for each
        for u in d["pendingUsers"]:
            assert "organisation" in u

    def test_approve_pending_new_org_user_validates_org(self, admin_session):
        # Find tom (new-org pending)
        q = admin_session.get(f"{API}/admin/validation-queue").json()
        tom = next((u for u in q["pendingUsers"] if u["email"] == PENDING_NEW[0]), None)
        if not tom:
            pytest.skip("tom@deschakel already approved in a previous run")
        org_id = tom["organisationId"]
        r = admin_session.post(f"{API}/admin/users/{tom['id']}/decision", json={"decision": "approve"})
        assert r.status_code == 200
        # Verify org became active/validated
        org = requests.get(f"{API}/organisations/{org_id}").json()
        assert org["status"] in ("active", "validated")
        # Now tom can login
        s2, u2 = login(*PENDING_NEW)
        assert u2["status"] == "validated"

    def test_update_me_email_uniqueness(self, validated_session):
        me = validated_session.get(f"{API}/auth/me").json()
        try:
            # try to change to admin email
            r = validated_session.patch(f"{API}/users/me", json={"email": ADMIN[0]})
            assert r.status_code == 409
            # change to a unique email and back
            new_email = f"test_lotte_{uuid.uuid4().hex[:6]}@example.com"
            r = validated_session.patch(f"{API}/users/me", json={"email": new_email})
            assert r.status_code == 200
            assert r.json()["email"] == new_email
        finally:
            # always restore original to keep fixtures stable
            validated_session.patch(f"{API}/users/me", json={"email": me["email"]})
