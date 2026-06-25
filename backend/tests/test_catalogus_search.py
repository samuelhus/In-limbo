"""Tests for /api/listings bilingual search (q parameter), searchKeywords stripping, regression checks."""
import os
import pytest
import requests
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_session(session):
    r = session.post(f"{API}/auth/login", json={"email": "admin@inlimbo.be", "password": "Admin123!"})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return session


# ---------- Regression: default behavior ----------
class TestDefaultListings:
    def test_no_q_no_filter_returns_isSearch_false_sorted_by_createdAt(self, session):
        r = session.get(f"{API}/listings")
        assert r.status_code == 200
        data = r.json()
        assert data["isSearch"] is False
        items = data["items"]
        if len(items) >= 2:
            created = [it.get("createdAt") for it in items if it.get("createdAt")]
            assert created == sorted(created, reverse=True), "Default sort should be createdAt DESC"

    def test_filter_in_magazijn_returns_isSearch_false_filtered(self, session):
        r = session.get(f"{API}/listings", params={"filter": "in_magazijn"})
        assert r.status_code == 200
        data = r.json()
        assert data["isSearch"] is False
        for it in data["items"]:
            # Limited view may not include status; full view will
            if "status" in it:
                assert it["status"] == "in_magazijn", f"got {it.get('status')}"


# ---------- Search: NL/FR ----------
class TestBilingualSearch:
    def test_q_hout_returns_isSearch_true_with_results(self, session):
        r = session.get(f"{API}/listings", params={"q": "hout"})
        assert r.status_code == 200
        data = r.json()
        assert data["isSearch"] is True
        assert data["total"] >= 1
        titles = [it.get("title", "") for it in data["items"]]
        # At least one Dutch wood-related listing present
        assert any("hout" in t.lower() or "lariks" in t.lower() or "balk" in t.lower() or "palet" in t.lower()
                   for t in titles), f"No wood listing found in: {titles}"

    def test_q_bois_returns_same_dutch_wood_listings(self, session):
        r = session.get(f"{API}/listings", params={"q": "bois"})
        assert r.status_code == 200
        data = r.json()
        assert data["isSearch"] is True
        assert data["total"] >= 1
        titles = [it.get("title", "") for it in data["items"]]
        joined = " | ".join(titles).lower()
        assert "lariks" in joined, f"Expected 'Lariks balken' via bilingual match. Got: {titles}"
        assert "palet" in joined or "paletten" in joined, f"Expected 'Houten paletten' via bilingual match. Got: {titles}"

    def test_q_stoel_vs_chaise_bilingual_symmetry(self, session):
        r_nl = session.get(f"{API}/listings", params={"q": "stoel"}).json()
        r_fr = session.get(f"{API}/listings", params={"q": "chaise"}).json()
        # Both must be searches
        assert r_nl["isSearch"] is True and r_fr["isSearch"] is True
        ids_nl = {it["id"] for it in r_nl["items"]}
        ids_fr = {it["id"] for it in r_fr["items"]}
        if ids_nl or ids_fr:
            overlap = ids_nl & ids_fr
            union = ids_nl | ids_fr
            # If any chair-related listings exist, sets should be near-identical
            assert len(overlap) / max(len(union), 1) >= 0.5, f"NL/FR overlap too small: nl={ids_nl} fr={ids_fr}"

    def test_q_nonsense_returns_zero_total(self, session):
        r = session.get(f"{API}/listings", params={"q": "onbestaandeterminalalal"})
        assert r.status_code == 200
        data = r.json()
        assert data["isSearch"] is True
        assert data["total"] == 0
        assert data["items"] == []


# ---------- searchKeywords MUST never appear ----------
class TestSearchKeywordsStripping:
    def test_no_searchKeywords_in_list_response_default(self, session):
        r = session.get(f"{API}/listings")
        for it in r.json()["items"]:
            assert "searchKeywords" not in it, f"searchKeywords leaked: {it.get('id')}"

    def test_no_searchKeywords_in_search_response(self, session):
        r = session.get(f"{API}/listings", params={"q": "hout"})
        for it in r.json()["items"]:
            assert "searchKeywords" not in it, f"searchKeywords leaked: {it.get('id')}"

    def test_no_searchKeywords_for_admin(self, admin_session):
        r = admin_session.get(f"{API}/listings", params={"q": "bois"})
        for it in r.json()["items"]:
            assert "searchKeywords" not in it, f"searchKeywords leaked to admin: {it.get('id')}"

    def test_no_searchKeywords_in_detail(self, session):
        r = session.get(f"{API}/listings", params={"q": "bois"})
        items = r.json()["items"]
        if not items:
            pytest.skip("no items to test detail")
        lid = items[0]["id"]
        det = session.get(f"{API}/listings/{lid}")
        assert det.status_code == 200
        assert "searchKeywords" not in det.json()


# ---------- POST creation triggers enrichment ----------
class TestCreateListingEnrichment:
    def test_create_listing_is_searchable_bilingually(self, admin_session):
        body = {
            "title": "TEST_search hout stoel",
            "description": "Een houten stoel voor de test.",
            "material": "Hout",
            "weight": 5.0,
            "photos": ["https://res.cloudinary.com/demo/image/upload/v1/sample.jpg"],
            "dimensions": "50x50x50",
            "transport": "afhalen",
            "isRecurrent": False,
            "deadline": "2099-12-31",
        }
        r = admin_session.post(f"{API}/listings", json=body)
        assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
        listing = r.json()
        lid = listing["id"]
        assert "searchKeywords" not in listing, "searchKeywords leaked in POST response"
        try:
            # Allow a moment for inline enrichment
            time.sleep(2)
            r2 = admin_session.get(f"{API}/listings", params={"q": "bois"})
            assert r2.status_code == 200
            ids = {it["id"] for it in r2.json()["items"]}
            assert lid in ids, "Newly created listing not findable via FR search after enrichment"
        finally:
            d = admin_session.delete(f"{API}/listings/{lid}")
            assert d.status_code == 200, f"cleanup failed: {d.status_code} {d.text}"


# ---------- Regression: other endpoints ----------
class TestRegression:
    def test_auth_me_with_admin_session(self, admin_session):
        r = admin_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == "admin@inlimbo.be"

    def test_news_endpoint(self, session):
        r = session.get(f"{API}/news")
        assert r.status_code == 200

    def test_organisations_endpoint(self, session):
        r = session.get(f"{API}/organisations")
        assert r.status_code == 200
