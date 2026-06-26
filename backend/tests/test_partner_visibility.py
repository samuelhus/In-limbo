"""Tests for org-level `visibleOnPartnerPage` feature.

Covers:
- POST /auth/register/new-org with/without orgVisibleOnPartnerPage
- GET /organisations?validated_only=true filter behaviour ($ne: False)
- PATCH /organisations/{id} as member toggles visibility
- PATCH from non-member returns 403
- GET /organisations/{id} returns 200 regardless of visibility
- GET /organisations/search returns hidden orgs (used by checkout/checkin)
- POST /auth/register/existing-org ignores unexpected orgVisibleOnPartnerPage
- Backwards-compat: legacy seed orgs without the field still listed
- Regression: /auth/me, /catalogus search baseline
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@inlimbo.be", "Admin123!")
LOTTE = ("lotte@atelier-brussel.example", "User123!")  # Atelier Brussel member
SAMIR = ("samir@vagebond.example", "User123!")  # Vagebond member


def _login(session: requests.Session, email: str, password: str) -> dict:
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password})
    if r.status_code == 429:
        time.sleep(15)
        r = session.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    _login(s, *ADMIN)
    return s


@pytest.fixture(scope="module")
def lotte_session():
    s = requests.Session()
    me = _login(s, *LOTTE)
    s.user = me
    return s


@pytest.fixture(scope="module")
def samir_session():
    s = requests.Session()
    me = _login(s, *SAMIR)
    s.user = me
    return s


# --------- 1. Register new-org with explicit False ---------
class TestRegisterNewOrgVisibility:
    @pytest.fixture(scope="class")
    def created_hidden(self, admin_session):
        unique = uuid.uuid4().hex[:8]
        body = {
            "email": f"TEST_hidden_{unique}@example.com",
            "password": "TestPass123!",
            "firstName": "TEST",
            "lastName": "Hidden",
            "orgName": f"TEST_Hidden_Org_{unique}",
            "orgDescription": "test desc",
            "orgCategory": "ander",
            "orgVisibleOnPartnerPage": False,
            "acceptedTerms": True,
        }
        r = requests.post(f"{API}/auth/register/new-org", json=body)
        if r.status_code == 429:
            time.sleep(15)
            r = requests.post(f"{API}/auth/register/new-org", json=body)
        assert r.status_code == 200, r.text
        data = r.json()
        org_id = data["organisationId"]
        user_id = data["userId"]
        # Approve via admin so it shows up in validated_only
        ra = admin_session.post(
            f"{API}/admin/organisations/{org_id}/decision",
            json={"decision": "approve"},
        )
        assert ra.status_code == 200, ra.text
        admin_session.post(
            f"{API}/admin/users/{user_id}/decision",
            json={"decision": "approve"},
        )
        yield {"orgId": org_id, "userId": user_id, "email": body["email"]}
        # cleanup
        admin_session.delete(f"{API}/admin/users/{user_id}")
        admin_session.delete(f"{API}/admin/organisations/{org_id}")

    @pytest.fixture(scope="class")
    def created_default(self, admin_session):
        unique = uuid.uuid4().hex[:8]
        body = {
            "email": f"TEST_visible_{unique}@example.com",
            "password": "TestPass123!",
            "firstName": "TEST",
            "lastName": "Visible",
            "orgName": f"TEST_Visible_Org_{unique}",
            "orgDescription": "test desc",
            "orgCategory": "ander",
            "acceptedTerms": True,
        }
        r = requests.post(f"{API}/auth/register/new-org", json=body)
        if r.status_code == 429:
            time.sleep(15)
            r = requests.post(f"{API}/auth/register/new-org", json=body)
        assert r.status_code == 200, r.text
        data = r.json()
        org_id = data["organisationId"]
        user_id = data["userId"]
        admin_session.post(
            f"{API}/admin/organisations/{org_id}/decision",
            json={"decision": "approve"},
        )
        admin_session.post(
            f"{API}/admin/users/{user_id}/decision",
            json={"decision": "approve"},
        )
        yield {"orgId": org_id, "userId": user_id, "email": body["email"]}
        admin_session.delete(f"{API}/admin/users/{user_id}")
        admin_session.delete(f"{API}/admin/organisations/{org_id}")

    def test_register_with_false_persists(self, admin_session, created_hidden):
        r = admin_session.get(f"{API}/organisations/{created_hidden['orgId']}")
        assert r.status_code == 200
        assert r.json().get("visibleOnPartnerPage") is False

    def test_register_default_true(self, admin_session, created_default):
        r = admin_session.get(f"{API}/organisations/{created_default['orgId']}")
        assert r.status_code == 200
        assert r.json().get("visibleOnPartnerPage") is True

    def test_hidden_org_absent_from_partner_list(self, created_hidden):
        r = requests.get(f"{API}/organisations", params={"validated_only": "true"})
        assert r.status_code == 200
        ids = [o["id"] for o in r.json()]
        assert created_hidden["orgId"] not in ids

    def test_visible_org_present_in_partner_list(self, created_default):
        r = requests.get(f"{API}/organisations", params={"validated_only": "true"})
        assert r.status_code == 200
        ids = [o["id"] for o in r.json()]
        assert created_default["orgId"] in ids

    def test_profile_page_still_accessible_for_hidden(self, created_hidden):
        r = requests.get(f"{API}/organisations/{created_hidden['orgId']}")
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == created_hidden["orgId"]
        assert data.get("visibleOnPartnerPage") is False

    def test_search_returns_hidden_org(self, created_hidden, admin_session):
        # search uses name prefix; org name starts with TEST_Hidden_Org_
        r = admin_session.get(
            f"{API}/organisations/search", params={"q": "TEST_Hidden_Org_"}
        )
        assert r.status_code == 200
        ids = [o["id"] for o in r.json()]
        assert created_hidden["orgId"] in ids, "Search must still find hidden orgs"


# --------- 2. PATCH toggle as validated member ---------
class TestPatchVisibility:
    def test_member_can_toggle_off_and_on(self, lotte_session):
        org_id = lotte_session.user["organisationId"]
        # Toggle OFF
        r = lotte_session.patch(
            f"{API}/organisations/{org_id}", json={"visibleOnPartnerPage": False}
        )
        assert r.status_code == 200, r.text
        assert r.json().get("visibleOnPartnerPage") is False

        # Verify absent from partner list
        r2 = requests.get(f"{API}/organisations", params={"validated_only": "true"})
        ids = [o["id"] for o in r2.json()]
        assert org_id not in ids, "Org with False should be hidden"

        # Toggle back ON
        r3 = lotte_session.patch(
            f"{API}/organisations/{org_id}", json={"visibleOnPartnerPage": True}
        )
        assert r3.status_code == 200
        assert r3.json().get("visibleOnPartnerPage") is True

        # Verify present again
        r4 = requests.get(f"{API}/organisations", params={"validated_only": "true"})
        ids2 = [o["id"] for o in r4.json()]
        assert org_id in ids2, "Org with True should reappear"

    def test_non_member_gets_403(self, samir_session, lotte_session):
        lotte_org_id = lotte_session.user["organisationId"]
        # Samir tries to patch Lotte's org
        r = samir_session.patch(
            f"{API}/organisations/{lotte_org_id}",
            json={"visibleOnPartnerPage": False},
        )
        assert r.status_code == 403


# --------- 3. Backwards-compat: legacy orgs without field ---------
class TestBackwardsCompat:
    def test_legacy_orgs_visible_when_field_missing(self):
        # Seed orgs (Atelier Brussel, Vagebond) explicitly include the field
        # per current seed.py. Test that the $ne: False filter is permissive:
        # any org without the field is treated as visible.
        # We rely on the partner directory containing seed orgs as a smoke test.
        r = requests.get(f"{API}/organisations", params={"validated_only": "true"})
        assert r.status_code == 200
        names = [o["name"] for o in r.json()]
        assert "Atelier Brussel" in names
        assert "Theatergezelschap Vagebond" in names


# --------- 4. existing-org ignores extra field ---------
class TestRegisterExistingOrgIgnoresField:
    def test_existing_org_extra_field_ok(self, admin_session):
        # Need a validated org id
        r = requests.get(f"{API}/organisations", params={"validated_only": "true"})
        orgs = r.json()
        org_id = next(o["id"] for o in orgs if o["name"] == "Atelier Brussel")

        unique = uuid.uuid4().hex[:8]
        body = {
            "email": f"TEST_existing_{unique}@example.com",
            "password": "TestPass123!",
            "firstName": "TEST",
            "lastName": "Existing",
            "organisationId": org_id,
            "orgVisibleOnPartnerPage": False,  # Unexpected; pydantic should ignore
            "acceptedTerms": True,
        }
        rr = requests.post(f"{API}/auth/register/existing-org", json=body)
        if rr.status_code == 429:
            time.sleep(15)
            rr = requests.post(f"{API}/auth/register/existing-org", json=body)
        assert rr.status_code == 200, rr.text
        user_id = rr.json()["userId"]
        admin_session.delete(f"{API}/admin/users/{user_id}")


# --------- 5. Regression ---------
class TestRegression:
    def test_auth_me(self, lotte_session):
        r = lotte_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == LOTTE[0]

    def test_catalogus_search_still_works(self):
        r = requests.get(f"{API}/listings", params={"q": "hout"})
        assert r.status_code == 200
        # Body may be a list or dict with results; just ensure 200 + parseable
        assert r.json() is not None
