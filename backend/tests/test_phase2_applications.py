"""Phase 2a tests: application flow + status transitions + admin warehouse checkbox."""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # fallback to internal
    BASE_URL = "http://localhost:8001"

API = f"{BASE_URL}/api"

ADMIN = ("admin@inlimbo.be", "Admin123!")
LOTTE = ("lotte@atelier-brussel.example", "User123!")
SAMIR = ("samir@vagebond.example", "User123!")
NORA_PENDING = ("nora.pending@atelier-brussel.example", "User123!")


def _session(creds=None):
    s = requests.Session()
    if creds:
        r = s.post(f"{API}/auth/login", json={"email": creds[0], "password": creds[1]}, timeout=15)
        assert r.status_code == 200, f"login {creds[0]} failed: {r.status_code} {r.text}"
    return s


def _me(s):
    return s.get(f"{API}/auth/me").json()


def _find_listing_by_title(s, title):
    skip = 0
    while True:
        r = s.get(f"{API}/listings", params={"limit": 50, "skip": skip})
        assert r.status_code == 200, r.text
        data = r.json()
        for it in data["items"]:
            if it.get("title") == title:
                return it
        skip += 50
        if skip >= data.get("total", 0) or not data["items"]:
            return None


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def lotte():
    return _session(LOTTE)


@pytest.fixture(scope="module")
def samir():
    return _session(SAMIR)


@pytest.fixture(scope="module")
def admin():
    return _session(ADMIN)


@pytest.fixture(scope="module")
def anon():
    return requests.Session()


@pytest.fixture(scope="module")
def listings(lotte):
    """Locate seed listings by title."""
    out = {}
    for title in ["Rode fluwelen gordijnen", "Lariks balken — 4 stuks", "Stalen H-profielen"]:
        l = _find_listing_by_title(lotte, title)
        assert l, f"Seed listing '{title}' missing"
        out[title] = l["id"]
    # alias for convenience
    out["Lariks balken"] = out["Lariks balken — 4 stuks"]
    return out


# ---------- Apply rules ----------
class TestApply:
    def test_apply_own_org_forbidden(self, samir, listings):
        # Rode fluwelen gordijnen is Samir's own org listing
        r = samir.post(f"{API}/listings/{listings['Rode fluwelen gordijnen']}/apply",
                       json={"motivation": "test"})
        assert r.status_code == 400, r.text
        # Either "eigen aanbieding" (own listing) or "eigen organisatie" — both are valid 400 outcomes
        body_low = r.text.lower()
        assert ("eigen organisatie" in body_low) or ("eigen aanbieding" in body_low)

    def test_apply_recurrent_forbidden(self, samir, listings):
        r = samir.post(f"{API}/listings/{listings['Stalen H-profielen']}/apply",
                       json={"motivation": "test"})
        assert r.status_code == 400, r.text
        assert "recurrent" in r.text.lower()

    def test_apply_existing_open_conflict_then_withdraw_then_reapply(self, samir, listings):
        # Seed already has Samir → Lariks balken open
        r = samir.post(f"{API}/listings/{listings['Lariks balken']}/apply",
                       json={"motivation": "again"})
        assert r.status_code == 409, r.text

        # Find existing application via /applications/mine
        mine = samir.get(f"{API}/applications/mine").json()
        existing = next((a for a in mine if a["listingId"] == listings["Lariks balken"] and a["status"] == "open"), None)
        assert existing, f"Could not find seeded open application: {mine}"
        w = samir.post(f"{API}/applications/{existing['id']}/withdraw")
        assert w.status_code == 200, w.text

        # Re-apply succeeds
        r2 = samir.post(f"{API}/listings/{listings['Lariks balken']}/apply",
                        json={"motivation": "Wij willen deze balken gebruiken"})
        assert r2.status_code in (200, 201), r2.text
        body = r2.json()
        assert body["status"] == "open"
        assert body["motivation"] == "Wij willen deze balken gebruiken"

    def test_apply_anonymous_401(self, anon, listings):
        r = anon.post(f"{API}/listings/{listings['Lariks balken']}/apply",
                      json={"motivation": "x"})
        assert r.status_code == 401, r.text

    def test_apply_pending_user_403(self, listings):
        # Register a fresh pending user (seeded pending users have been approved by prior tests)
        import uuid as _uuid
        s = requests.Session()
        email = f"TEST_pending_{_uuid.uuid4().hex[:8]}@example.com"
        reg = s.post(f"{API}/auth/register/new-org", json={
            "email": email, "password": "Pass1234!",
            "firstName": "Pending", "lastName": "Tester", "phone": "+32400000000",
            "orgName": f"TEST_org_{_uuid.uuid4().hex[:6]}", "orgDescription": "x",
            "orgCategory": "Educatie", "orgAddress": "Brussel",
            "orgWebsite": None, "acceptedTerms": True,
        })
        assert reg.status_code == 200, reg.text
        r = s.post(f"{API}/listings/{listings['Lariks balken']}/apply",
                   json={"motivation": "x"})
        assert r.status_code == 403, r.text


# ---------- mine + owner panel ----------
class TestApplicationsLists:
    def test_my_applications_embedded(self, samir, listings):
        r = samir.get(f"{API}/applications/mine")
        assert r.status_code == 200
        data = r.json()
        assert any(a["listingId"] == listings["Lariks balken"] for a in data)
        for a in data:
            assert "listing" in a
            l = a["listing"]
            assert {"id", "title", "photo", "status", "organisationName"}.issubset(l.keys())

    def test_owner_sees_applications_no_email_yet(self, lotte, listings):
        r = lotte.get(f"{API}/listings/{listings['Lariks balken']}/applications")
        assert r.status_code == 200
        apps = r.json()
        assert len(apps) >= 1
        for a in apps:
            assert "applicant" in a
            assert {"firstName", "lastName", "organisationName", "organisationDescription"}.issubset(a["applicant"].keys())
            if a["status"] == "open":
                assert "email" not in a["applicant"]
                assert "phone" not in a["applicant"]

    def test_non_owner_forbidden(self, samir, listings):
        r = samir.get(f"{API}/listings/{listings['Lariks balken']}/applications")
        assert r.status_code == 403


# ---------- Select / unselect / rehome flow on a fresh test listing ----------
@pytest.fixture(scope="module")
def test_listing(lotte, samir):
    """Create a fresh listing owned by Lotte for state-transition tests."""
    payload = {
        "title": "TEST_phase2_listing",
        "description": "ephemeral test listing",
        "material": "Hout",
        "weight": 12.5,
        "photos": ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
        "isRecurrent": False,
        "deadline": "2026-12-31",
    }
    r = lotte.post(f"{API}/listings", json=payload)
    assert r.status_code in (200, 201), r.text
    listing_id = r.json()["id"]
    # Samir applies
    a = samir.post(f"{API}/listings/{listing_id}/apply",
                   json={"motivation": "test motivation"})
    assert a.status_code in (200, 201), a.text
    application_id = a.json()["id"]
    yield {"id": listing_id, "applicationId": application_id}


class TestTransitions:
    def test_select_and_contact_visibility(self, lotte, samir, test_listing):
        # Select
        r = lotte.post(f"{API}/listings/{test_listing['id']}/select-applicant",
                       json={"applicationId": test_listing["applicationId"]})
        assert r.status_code == 200, r.text

        # Owner sees selected applicant contact
        det_owner = lotte.get(f"{API}/listings/{test_listing['id']}").json()
        assert det_owner["status"] == "in_afwachting"
        assert det_owner.get("selectedApplicantContact"), det_owner
        assert det_owner["selectedApplicantContact"]["email"]
        assert det_owner["selectedApplicantContact"]["firstName"]

        # Applicant sees offerer contact
        det_app = samir.get(f"{API}/listings/{test_listing['id']}").json()
        assert det_app.get("myApplication", {}).get("status") == "selected"
        assert det_app.get("selectedApplicantContact"), det_app
        assert det_app["selectedApplicantContact"]["email"]
        # Email shown in listing applications too
        apps = lotte.get(f"{API}/listings/{test_listing['id']}/applications").json()
        assert any(a.get("applicant", {}).get("email") for a in apps if a["status"] == "selected")

    def test_select_when_not_beschikbaar_400(self, lotte, test_listing):
        # Currently in_afwachting → select must fail
        r = lotte.post(f"{API}/listings/{test_listing['id']}/select-applicant",
                       json={"applicationId": test_listing["applicationId"]})
        assert r.status_code == 400

    def test_withdraw_selected_forbidden(self, samir, test_listing):
        r = samir.post(f"{API}/applications/{test_listing['applicationId']}/withdraw")
        assert r.status_code == 400

    def test_unselect_back_to_beschikbaar(self, lotte, test_listing):
        r = lotte.post(f"{API}/listings/{test_listing['id']}/unselect")
        assert r.status_code == 200
        det = lotte.get(f"{API}/listings/{test_listing['id']}").json()
        assert det["status"] == "beschikbaar"
        assert det.get("selectedApplicantId") in (None,)

    def test_unselect_when_not_in_afwachting_400(self, lotte, test_listing):
        r = lotte.post(f"{API}/listings/{test_listing['id']}/unselect")
        assert r.status_code == 400

    def test_mark_rehomed_and_unrehome(self, lotte, samir, test_listing):
        r = lotte.post(f"{API}/listings/{test_listing['id']}/mark-rehomed")
        assert r.status_code == 200, r.text
        det = lotte.get(f"{API}/listings/{test_listing['id']}").json()
        assert det["status"] == "herbestemd"

        # Application status now not_selected
        mine = samir.get(f"{API}/applications/mine").json()
        target = next(a for a in mine if a["id"] == test_listing["applicationId"])
        assert target["status"] == "not_selected"

        # Unrehome cannot happen from non-herbestemd; first verify positive path
        u = lotte.post(f"{API}/listings/{test_listing['id']}/unrehome")
        assert u.status_code == 200
        det2 = lotte.get(f"{API}/listings/{test_listing['id']}").json()
        assert det2["status"] == "beschikbaar"
        assert det2.get("selectedApplicantId") is None
        mine2 = samir.get(f"{API}/applications/mine").json()
        target2 = next(a for a in mine2 if a["id"] == test_listing["applicationId"])
        assert target2["status"] == "open"

    def test_unrehome_when_not_herbestemd_400(self, lotte, test_listing):
        r = lotte.post(f"{API}/listings/{test_listing['id']}/unrehome")
        assert r.status_code == 400

    def test_select_forbidden_for_non_owner(self, samir, test_listing):
        r = samir.post(f"{API}/listings/{test_listing['id']}/select-applicant",
                       json={"applicationId": test_listing["applicationId"]})
        assert r.status_code == 403

    def test_mark_rehomed_forbidden_for_non_owner(self, samir, test_listing):
        r = samir.post(f"{API}/listings/{test_listing['id']}/mark-rehomed")
        assert r.status_code == 403


# ---------- Withdraw rules ----------
class TestWithdraw:
    def test_withdraw_by_other_user_forbidden(self, lotte, samir, test_listing):
        # Test listing's app is owned by Samir; Lotte cannot withdraw it
        r = lotte.post(f"{API}/applications/{test_listing['applicationId']}/withdraw")
        assert r.status_code == 403


# ---------- placeInWarehouse admin checkbox ----------
class TestPlaceInWarehouse:
    def test_admin_can_place_in_warehouse(self, admin):
        # admin has organisationId "" — listing creation might fail because get_validated_user
        # requires validated status. Check first.
        me = admin.get(f"{API}/auth/me").json()
        if me.get("status") != "validated":
            pytest.skip("admin not validated")
        payload = {
            "title": "TEST_warehouse_listing",
            "description": "admin warehouse test",
            "material": "Hout",
            "weight": 10.0,
            "photos": ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
            "isRecurrent": False,
            "deadline": "2026-12-31",
            "placeInWarehouse": True,
        }
        r = admin.post(f"{API}/listings", json=payload)
        assert r.status_code in (200, 201), r.text
        assert r.json()["status"] == "in_magazijn"

    def test_normal_user_place_in_warehouse_ignored(self, lotte):
        payload = {
            "title": "TEST_ignored_warehouse",
            "description": "lotte tries warehouse",
            "material": "Hout",
            "weight": 10.0,
            "photos": ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
            "isRecurrent": False,
            "deadline": "2026-12-31",
            "placeInWarehouse": True,
        }
        r = lotte.post(f"{API}/listings", json=payload)
        assert r.status_code in (200, 201), r.text
        assert r.json()["status"] == "beschikbaar"


# ---------- Cleanup seed data ----------
def test_zz_restore_seed_state(lotte, samir):
    """Restore Lariks balken seed state and Samir's seed application to status=open."""
    l = _find_listing_by_title(lotte, "Lariks balken")
    if not l:
        return
    lid = l["id"]
    # If anything is in afwachting/herbestemd, reset
    det = lotte.get(f"{API}/listings/{lid}").json()
    if det["status"] == "in_afwachting":
        lotte.post(f"{API}/listings/{lid}/unselect")
    det = lotte.get(f"{API}/listings/{lid}").json()
    if det["status"] == "herbestemd":
        lotte.post(f"{API}/listings/{lid}/unrehome")
    # Withdraw all Samir's apps then re-apply ONE to leave the seed-like state
    mine = samir.get(f"{API}/applications/mine").json()
    for a in mine:
        if a["listingId"] == lid and a["status"] in ("open", "not_selected"):
            samir.post(f"{API}/applications/{a['id']}/withdraw")
    # Re-apply a new open application to mimic original seed
    samir.post(f"{API}/listings/{lid}/apply", json={"motivation": "Hergebruik voor stagedecor"})
