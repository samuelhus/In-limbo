"""Tests for admin user & organisation management endpoints."""
import os
import time
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


# ---------- GET admin/users ----------
def test_admin_list_users_returns_all(admin_session):
    r = admin_session.get(f"{BASE}/admin/users", timeout=15)
    assert r.status_code == 200
    users = r.json()
    assert isinstance(users, list)
    assert len(users) >= 15, f"expected >=15 users got {len(users)}"
    # Validate fields
    sample = users[0]
    for f in ("id", "email", "role", "status", "createdAt"):
        assert f in sample, f"missing {f}"
    # password should not be exposed
    assert "passwordHash" not in sample
    # organisationName attached
    has_org_name = any("organisationName" in u for u in users)
    assert has_org_name


def test_admin_list_users_search(admin_session):
    r = admin_session.get(f"{BASE}/admin/users", params={"q": "lotte"}, timeout=15)
    assert r.status_code == 200
    users = r.json()
    assert len(users) >= 1
    assert any("lotte" in (u.get("email") or "").lower() for u in users)


# ---------- GET admin/organisations ----------
def test_admin_list_orgs_returns_all(admin_session):
    r = admin_session.get(f"{BASE}/admin/organisations", timeout=15)
    assert r.status_code == 200
    orgs = r.json()
    assert isinstance(orgs, list)
    assert len(orgs) >= 10
    sample = orgs[0]
    for f in ("id", "name", "category", "status", "userCount"):
        assert f in sample
    assert isinstance(sample["userCount"], int)


# ---------- PATCH user ----------
def test_admin_patch_user_persists(admin_session):
    # Pick a non-admin, non-seed-critical user (find a pending one)
    users = admin_session.get(f"{BASE}/admin/users", timeout=15).json()
    target = next((u for u in users if u.get("status") == "pending" and u["email"] != ADMIN_EMAIL), None)
    if not target:
        target = next(u for u in users if u["email"] not in (ADMIN_EMAIL, NON_ADMIN_EMAIL))
    uid = target["id"]
    original_first = target.get("firstName")
    new_first = f"TEST_Patched_{int(time.time())}"
    r = admin_session.patch(f"{BASE}/admin/users/{uid}", json={"firstName": new_first}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["firstName"] == new_first
    # Verify by GET
    users2 = admin_session.get(f"{BASE}/admin/users", timeout=15).json()
    fresh = next(u for u in users2 if u["id"] == uid)
    assert fresh["firstName"] == new_first
    # Restore
    admin_session.patch(f"{BASE}/admin/users/{uid}", json={"firstName": original_first or "Restored"}, timeout=15)


def test_admin_patch_user_email_conflict(admin_session):
    users = admin_session.get(f"{BASE}/admin/users", timeout=15).json()
    a = next(u for u in users if u["email"] == NON_ADMIN_EMAIL)
    b = next(u for u in users if u["email"] != NON_ADMIN_EMAIL and u["email"] != ADMIN_EMAIL)
    r = admin_session.patch(f"{BASE}/admin/users/{b['id']}", json={"email": a["email"]}, timeout=15)
    assert r.status_code == 409


def test_admin_patch_user_not_found(admin_session):
    r = admin_session.patch(f"{BASE}/admin/users/does-not-exist-xyz", json={"firstName": "X"}, timeout=15)
    assert r.status_code == 404


# ---------- PATCH org ----------
def test_admin_patch_org_persists(admin_session):
    orgs = admin_session.get(f"{BASE}/admin/organisations", timeout=15).json()
    # Prefer pending or TEST_ org to avoid impacting other tests
    target = next((o for o in orgs if o.get("status") == "pending"), None) or \
             next((o for o in orgs if "TEST_" in (o.get("name") or "")), None) or orgs[-1]
    oid = target["id"]
    original_desc = target.get("description") or ""
    new_desc = f"TEST_Patched desc {int(time.time())}"
    r = admin_session.patch(f"{BASE}/admin/organisations/{oid}", json={"description": new_desc}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["description"] == new_desc
    # Verify via list
    fresh = next(o for o in admin_session.get(f"{BASE}/admin/organisations", timeout=15).json() if o["id"] == oid)
    assert fresh["description"] == new_desc
    # Restore
    admin_session.patch(f"{BASE}/admin/organisations/{oid}", json={"description": original_desc}, timeout=15)


def test_admin_patch_org_not_found(admin_session):
    r = admin_session.patch(f"{BASE}/admin/organisations/nope-xyz", json={"name": "X"}, timeout=15)
    assert r.status_code == 404


# ---------- DELETE flows ----------
def _register_test_user_and_org(prefix="TEST_admin_delete"):
    """Create a fresh pending user+org via public register endpoint."""
    ts = int(time.time() * 1000)
    email = f"{prefix.lower()}_{ts}@example.com"
    body = {
        "email": email,
        "password": "Pass1234!",
        "firstName": "TEST",
        "lastName": "Delete",
        "orgName": f"{prefix}_org_{ts}",
        "orgDescription": "to be deleted",
        "orgCategory": "Ander",
        "acceptedTerms": True,
    }
    r = requests.post(f"{BASE}/auth/register/new-org", json=body, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return d["userId"], d["organisationId"], email


def test_admin_delete_user_archives_listings(admin_session):
    uid, oid, _ = _register_test_user_and_org("TEST_du")
    r = admin_session.delete(f"{BASE}/admin/users/{uid}", timeout=15)
    assert r.status_code == 200, r.text
    # User no longer in list
    users = admin_session.get(f"{BASE}/admin/users", timeout=15).json()
    assert not any(u["id"] == uid for u in users)
    # Cleanup org (might still exist)
    admin_session.delete(f"{BASE}/admin/organisations/{oid}", timeout=15)


def test_admin_delete_self_behavior(admin_session):
    """Admin shouldn't be able to delete their own account."""
    me = admin_session.get(f"{BASE}/auth/me", timeout=15).json()
    my_id = me["id"]
    r = admin_session.delete(f"{BASE}/admin/users/{my_id}", timeout=15)
    assert r.status_code == 400, f"Expected 400 self-delete block, got {r.status_code}: {r.text}"
    assert "jezelf" in r.json().get("detail", "").lower()
    # Confirm admin still exists
    me2 = admin_session.get(f"{BASE}/auth/me", timeout=15).json()
    assert me2["id"] == my_id


def test_admin_delete_org_cascades(admin_session):
    uid, oid, _ = _register_test_user_and_org("TEST_dorg")
    r = admin_session.delete(f"{BASE}/admin/organisations/{oid}", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("deletedUsers", 0) >= 1
    # Org gone
    orgs = admin_session.get(f"{BASE}/admin/organisations", timeout=15).json()
    assert not any(o["id"] == oid for o in orgs)
    # User of that org gone too
    users = admin_session.get(f"{BASE}/admin/users", timeout=15).json()
    assert not any(u["id"] == uid for u in users)


def test_admin_delete_user_not_found(admin_session):
    r = admin_session.delete(f"{BASE}/admin/users/nope-xyz", timeout=15)
    assert r.status_code == 404


def test_admin_delete_org_not_found(admin_session):
    r = admin_session.delete(f"{BASE}/admin/organisations/nope-xyz", timeout=15)
    assert r.status_code == 404


# ---------- Authorization ----------
def test_non_admin_forbidden_on_admin_users(non_admin_session):
    r = non_admin_session.get(f"{BASE}/admin/users", timeout=15)
    assert r.status_code in (401, 403)


def test_non_admin_forbidden_on_admin_orgs(non_admin_session):
    r = non_admin_session.get(f"{BASE}/admin/organisations", timeout=15)
    assert r.status_code in (401, 403)


def test_non_admin_forbidden_patch(non_admin_session):
    r = non_admin_session.patch(f"{BASE}/admin/users/whatever", json={"firstName": "x"}, timeout=15)
    assert r.status_code in (401, 403)


def test_non_admin_forbidden_delete(non_admin_session):
    r = non_admin_session.delete(f"{BASE}/admin/organisations/whatever", timeout=15)
    assert r.status_code in (401, 403)


def test_anonymous_forbidden(non_admin_session):
    r = requests.get(f"{BASE}/admin/users", timeout=15)
    assert r.status_code in (401, 403)
