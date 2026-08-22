"""Tests for slowapi rate limiting on /auth/login, /auth/register/*, /auth/forgot-password
and full forgot-password / reset-password flow (TTL, single-use, enumeration prevention).

NOTE: rate-limit tests are placed FIRST so we can wait 60s afterward and then run
functional tests on fresh buckets. Login rate limit is tested last in phase A so we
can simply sleep 60s before functional tests that need login.
"""
import os
import sys
import time
import secrets
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

# Make backend importable for password hashing helper (used for cleanup)
sys.path.insert(0, "/app/backend")
from auth import hash_password  # noqa: E402

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://limbo-stage.preview.emergentagent.com"
# Public URL (must hit /api prefix)
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "inlimbo_db")

USER_EMAIL = "lotte@atelier-brussel.example"
USER_PWD = "User123!"
NONEXISTENT = "doesnotexist_999_test@example.com"

mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]


# ---------------------------------------------------------------------------
# Module setup / teardown
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module", autouse=True)
def restore_state():
    """Ensure lotte's password is restored to User123! and reset tokens cleaned."""
    # pre-clean
    db.password_resets.delete_many({})
    yield
    # post-clean
    db.users.update_one(
        {"email": USER_EMAIL},
        {"$set": {"passwordHash": hash_password(USER_PWD)}},
    )
    db.password_resets.delete_many({})


# ---------------------------------------------------------------------------
# 0. Indexes
# ---------------------------------------------------------------------------
def test_0_indexes_exist():
    info = db.password_resets.index_information()
    token_keys = [v for v in info.values() if v["key"] == [("token", 1)]]
    assert token_keys, f"token unique index missing. Got {info}"
    assert token_keys[0].get("unique") is True
    ttl = [v for v in info.values() if v["key"] == [("expiresAt", 1)] and "expireAfterSeconds" in v]
    assert ttl, f"TTL index on expiresAt missing. Got {info}"
    assert ttl[0]["expireAfterSeconds"] == 0


# ---------------------------------------------------------------------------
# PHASE A: Rate-limit tests (burn buckets, wait 60s afterwards)
# ---------------------------------------------------------------------------
def test_a1_rate_limit_forgot_password():
    """/auth/forgot-password limit = 5/minute. 6th call → 429 with NL msg."""
    last = None
    for i in range(6):
        last = requests.post(f"{API}/auth/forgot-password", json={"email": NONEXISTENT})
    assert last.status_code == 429, f"Expected 429 on 6th call, got {last.status_code}: {last.text}"
    detail = last.json().get("detail", "")
    assert detail == "Te veel resetaanvragen. Probeer het over een minuut opnieuw.", f"Unexpected msg: {detail}"


def test_a2_rate_limit_register_donateur():
    """/auth/register/donateur limit = 10/minute. 11th → 429."""
    last = None
    for i in range(11):
        # Use already-registered email so 409 returned, but limiter still counts.
        last = requests.post(f"{API}/auth/register/donateur", json={
            "username": f"x_test_rl_{i}",
            "email": "donna@inlimbo.be",
            "password": "test1234",
            "acceptedTerms": True,
        })
    assert last.status_code == 429, f"Expected 429 on 11th call, got {last.status_code}: {last.text}"
    assert "registratie" in last.json().get("detail", "").lower()


def test_a3_rate_limit_login():
    """/auth/login limit = 5/minute. 6th → 429 with NL msg. Tests both correct & wrong creds count."""
    last = None
    for i in range(6):
        # Alternate correct/wrong creds — limit is endpoint-level, not conditional.
        creds = {"email": USER_EMAIL, "password": USER_PWD if i % 2 == 0 else "wrongpw"}
        last = requests.post(f"{API}/auth/login", json=creds)
    assert last.status_code == 429, f"Expected 429 on 6th call, got {last.status_code}: {last.text}"
    detail = last.json().get("detail", "")
    assert detail == "Te veel inlogpogingen. Probeer het over een minuut opnieuw.", f"Unexpected msg: {detail}"


# ---------------------------------------------------------------------------
# PHASE B: wait for rate-limit buckets to reset
# ---------------------------------------------------------------------------
def test_b_wait_for_rate_limit_reset():
    """Sleep ~65s so all per-minute buckets reset before functional tests."""
    time.sleep(65)


# ---------------------------------------------------------------------------
# PHASE C: Functional tests
# ---------------------------------------------------------------------------
def test_c1_login_normal_regression():
    """Login still works normally and sets il_token cookie."""
    r = requests.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PWD})
    assert r.status_code == 200, r.text
    assert "il_token" in r.cookies
    body = r.json()
    assert body.get("email") == USER_EMAIL
    assert body.get("role") in ("user", "admin")
    assert "passwordHash" not in body


def test_c2_forgot_existing_email_creates_token():
    db.password_resets.delete_many({"email": USER_EMAIL})
    r = requests.post(f"{API}/auth/forgot-password", json={"email": USER_EMAIL})
    assert r.status_code == 200
    assert r.json() == {"ok": True, "message": "Als dit e-mailadres bestaat, sturen we een resetlink."}
    rec = db.password_resets.find_one({"email": USER_EMAIL})
    assert rec is not None
    assert rec["used"] is False
    assert isinstance(rec["expiresAt"], datetime)
    # expiresAt ~24h in future
    expires_at = rec["expiresAt"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    delta = expires_at - datetime.now(timezone.utc)
    assert 23 * 3600 < delta.total_seconds() < 25 * 3600


def test_c3_forgot_nonexistent_email_no_enum():
    """Non-existent email → identical response, NO token created."""
    before = db.password_resets.count_documents({})
    r = requests.post(f"{API}/auth/forgot-password", json={"email": NONEXISTENT})
    assert r.status_code == 200
    assert r.json() == {"ok": True, "message": "Als dit e-mailadres bestaat, sturen we een resetlink."}
    assert db.password_resets.find_one({"email": NONEXISTENT}) is None
    assert db.password_resets.count_documents({}) == before


def test_c4_forgot_replaces_old_token():
    db.password_resets.delete_many({"email": USER_EMAIL})
    requests.post(f"{API}/auth/forgot-password", json={"email": USER_EMAIL})
    requests.post(f"{API}/auth/forgot-password", json={"email": USER_EMAIL})
    assert db.password_resets.count_documents({"email": USER_EMAIL}) == 1


def test_c5_reset_invalid_token():
    r = requests.post(f"{API}/auth/reset-password", json={"token": "INVALID_NONEXISTENT_TOKEN", "newPassword": "secure123"})
    assert r.status_code == 400
    assert r.json()["detail"] == "Ongeldige of verlopen resetlink."


def test_c6_reset_short_password():
    r = requests.post(f"{API}/auth/reset-password", json={"token": "whatever", "newPassword": "12345"})
    assert r.status_code == 422


def test_c7_reset_expired_token():
    """Insert expired record, attempt reset, expect 400 + token cleanup."""
    expired_token = "EXPIRED_" + secrets.token_urlsafe(16)
    db.password_resets.insert_one({
        "token": expired_token,
        "userId": "fake-user-id",
        "email": "expired@example.com",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "expiresAt": datetime.now(timezone.utc) - timedelta(hours=1),
        "used": False,
    })
    r = requests.post(f"{API}/auth/reset-password", json={"token": expired_token, "newPassword": "secure123"})
    assert r.status_code == 400, r.text
    assert "verlopen" in r.json()["detail"].lower()
    # Token cleaned up
    assert db.password_resets.find_one({"token": expired_token}) is None


def test_c8_reset_happy_path_and_single_use():
    """Full happy path: request → reset → login w/ new pw → old pw fails → token single-use."""
    db.password_resets.delete_many({"email": USER_EMAIL})
    r = requests.post(f"{API}/auth/forgot-password", json={"email": USER_EMAIL})
    assert r.status_code == 200
    rec = db.password_resets.find_one({"email": USER_EMAIL})
    assert rec is not None
    token = rec["token"]
    new_pwd = "BrandNew99!"

    r2 = requests.post(f"{API}/auth/reset-password", json={"token": token, "newPassword": new_pwd})
    assert r2.status_code == 200, r2.text
    assert r2.json()["ok"] is True

    # New pw works
    rlogin_new = requests.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": new_pwd})
    assert rlogin_new.status_code == 200

    # Old pw fails
    rlogin_old = requests.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PWD})
    assert rlogin_old.status_code == 401

    # Single-use: token cannot be reused
    r_reuse = requests.post(f"{API}/auth/reset-password", json={"token": token, "newPassword": "AnotherPwd1!"})
    assert r_reuse.status_code == 400
    assert r_reuse.json()["detail"] == "Ongeldige of verlopen resetlink."

    # Restore password directly via DB hash (avoid hitting the 5/min forgot-password rate limit
    # in the same test window). Module teardown also has a hash-restore as safety net.
    import bcrypt
    new_hash = bcrypt.hashpw(USER_PWD.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    db.users.update_one({"email": USER_EMAIL}, {"$set": {"passwordHash": new_hash}})
    db.password_resets.delete_many({"email": USER_EMAIL})
    # don't login here; let the module teardown also hash-restore via DB just in case
