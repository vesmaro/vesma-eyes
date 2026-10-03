"""ME-080 (login+password accounts): the /api/auth/{register,login,logout,me}
surface and the password-session leg inside the ui guards.

Pinned contract (docs/design/2026-10-01-accounts-password-auth.md):
- register: OPEN only while the accounts table is empty — the first
  account is the board owner (owner verdict 07k §10-аддендум); then 403
  closed unless VESMARO_ALLOW_REGISTRATION=1 (member accounts); 409
  case-insensitive duplicate; 422 bounds/charset; success sets
  ``vesmaro_auth`` (HttpOnly, SameSite=strict, Path=/, Max-Age=21600,
  Secure only on https) and signs the account in;
- login: 200 + cookie; NEUTRAL 401 for unknown user AND wrong password
  (same detail, timing-equalized by a dummy scrypt burn); 429 on the flat
  limiters (per-IP 10/60s, global 60/60s — the ui-token verify budget);
- logout: server-side session-row DELETE (a replayed cookie dies), 204 +
  Max-Age=0, no guard by design, does NOT touch the ADR 0014 vesmaro_ui
  cookie;
- me: always-200 JSON oracle (ME-028 lesson), slides nothing;
- guard integration: the password session is the SAME ui-class admission
  (ui mutations, reports leg-pick, task-session-facts/Kora reads,
  telemetry ingest, actor attribution) — NEVER machine routes; header
  present → header leg ONLY; an mnd_ bearer is classified by the scope
  middleware before any cookie is consulted;
- sliding idle TTL: a cookie-leg mutation reissues vesmaro_auth with a
  fresh Max-Age and slides the DB expiry, throttled to one per session per
  5 min; a failed (422) request spends nothing; the header leg never
  slides the password session;
- hashing: scrypt envelope (algo-prefixed, per-hash salt, parameters from
  the envelope), malformed/out-of-bounds envelopes verify False, never
  raise; passwords never reach logs.
"""

from __future__ import annotations

import json
import re

import pytest
from conftest import BOARD_TOKEN, UI_TOKEN
from fastapi.testclient import TestClient
from server.security import RateLimiter, hash_password, verify_password

PASSWORD = "parol-12345678"


# ------------------------------------------------------------------ helpers
@pytest.fixture(autouse=True)
def fresh_accounts_state(app_module, monkeypatch, client):
    """Empty accounts table + isolated limiters/reissue table per test:
    the store is SESSION-scoped, so leftover accounts would flip the
    registration policy for later tests. The TestClient jar is wiped
    before AND after (a live ``vesmaro_auth`` would hydrate guards of
    later test files). VESMARO_ALLOW_REGISTRATION is pinned OUT — a shell
    env must never leak into the policy. scrypt is monkeypatched to a
    low-cost profile for suite speed (verify reads params from the
    envelope, so verification is fast by construction)."""
    from server import security

    monkeypatch.delenv("VESMARO_ALLOW_REGISTRATION", raising=False)
    monkeypatch.setattr(
        app_module, "hash_password",
        lambda pw: security.hash_password(pw, n=2 ** 12, r=8, p=1))
    for name in ("_auth_login_ip_limiter", "_auth_login_global_limiter",
                 "_auth_register_ip_limiter",
                 "_auth_register_global_limiter"):
        monkeypatch.setattr(
            app_module, name,
            RateLimiter(limit=getattr(app_module, name).limit,
                        window=getattr(app_module, name).window))
    app_module._auth_reissue_last.clear()

    def _wipe():
        with app_module.store._lock, app_module.store._conn() as db:
            db.execute("DELETE FROM auth_sessions")
            db.execute("DELETE FROM accounts")
            db.execute("DELETE FROM server_log WHERE server='auth'")

    _wipe()
    client.cookies.clear()
    yield
    _wipe()
    client.cookies.clear()


def _register(client: TestClient, username: str = "owner",
              password: str = PASSWORD):
    return client.post("/api/auth/register",
                       json={"username": username, "password": password})


def _login(client: TestClient, username: str = "owner",
           password: str = PASSWORD):
    return client.post("/api/auth/login",
                       json={"username": username, "password": password})


def _auth_cookie(response) -> str:
    """The raw vesmaro_auth token from a Set-Cookie header."""
    header = response.headers.get("set-cookie", "")
    match = re.search(r"vesmaro_auth=([^;]+)", header)
    assert match, header
    return match.group(1)


def _make_task(client: TestClient, title: str = "pw-session"):
    return client.post("/api/tasks", json={"title": title})


@pytest.fixture()
def fresh_report_limiter(app_module, monkeypatch):
    from server.security import RateLimiter as RL
    limiter = RL(limit=app_module._REPORT_RATE_LIMIT,
                 window=app_module._REPORT_RATE_WINDOW)
    monkeypatch.setattr(app_module, "_report_limiter", limiter)
    return limiter


# ------------------------------------------------------------------ register
class TestRegister:
    def test_first_account_is_owner_and_signs_in(self, client):
        r = _register(client)
        assert r.status_code == 201, r.text
        assert r.json() == {"username": "owner", "role": "owner"}
        header = r.headers.get("set-cookie", "").lower()
        assert "vesmaro_auth=" in header
        assert "httponly" in header
        assert "samesite=strict" in header
        assert "path=/" in header
        assert "max-age=21600" in header
        assert "secure" not in header  # http deploy: Secure must be ABSENT

    def test_register_https_sets_secure(self, app_module):
        https = TestClient(app_module.app, base_url="https://testserver")
        r = _register(https)
        assert "secure" in r.headers.get("set-cookie", "").lower()

    def test_second_account_403_closed(self, client):
        assert _register(client).status_code == 201
        r = _register(client, "second")
        assert r.status_code == 403
        assert "registration is closed" in r.json()["detail"]
        assert "VESMARO_ALLOW_REGISTRATION" in r.json()["detail"]

    def test_flag_opens_member_registration(self, client, monkeypatch):
        assert _register(client).status_code == 201
        monkeypatch.setenv("VESMARO_ALLOW_REGISTRATION", "1")
        r = _register(client, "helper")
        assert r.status_code == 201, r.text
        assert r.json() == {"username": "helper", "role": "member"}

    def test_duplicate_409(self, client, monkeypatch):
        assert _register(client).status_code == 201
        monkeypatch.setenv("VESMARO_ALLOW_REGISTRATION", "1")
        r = _register(client, "owner")
        assert r.status_code == 409
        assert "already registered" in r.json()["detail"]

    def test_uppercase_username_rejected_at_boundary_422(self, client,
                                                         monkeypatch):
        """The API boundary enforces the lowercase charset (422); the
        case-insensitive DB guard beneath it is the non-API path's
        backstop, covered in TestAccountStore."""
        assert _register(client).status_code == 201
        monkeypatch.setenv("VESMARO_ALLOW_REGISTRATION", "1")
        assert _register(client, "OWNER").status_code == 422

    @pytest.mark.parametrize("body", [
        {"username": "ab", "password": PASSWORD},            # too short
        {"username": "a" * 33, "password": PASSWORD},        # too long
        {"username": "Has Space", "password": PASSWORD},     # charset
        {"username": "-lead", "password": PASSWORD},         # must start alnum
        {"username": "okname", "password": "short7"},        # password < 8
        {"username": "okname", "password": "x" * 513},       # password > 512
        {"username": "okname", "password": PASSWORD,
         "extra": "no"},                                     # BE-15 honest 422
        {"username": "okname"},                              # missing password
    ])
    def test_422_bounds_and_charset(self, client, body):
        assert client.post("/api/auth/register", json=body).status_code == 422

    def test_429_after_per_ip_exhaustion(self, client, app_module,
                                         monkeypatch):
        monkeypatch.setattr(
            app_module, "_auth_register_ip_limiter", RateLimiter(1, 600.0))
        assert _register(client).status_code == 201
        r = _register(client, "other")
        assert r.status_code == 429
        assert "per client" in r.json()["detail"]

    def test_session_from_register_immediately_mutates(self, client):
        """Sign-in-on-register: the fresh cookie opens a ui mutation with
        NO Authorization header."""
        assert _register(client).status_code == 201
        assert _make_task(client, "right-after-register").status_code == 201


# --------------------------------------------------------------------- login
class TestLogin:
    def test_login_200_sets_cookie(self, client):
        assert _register(client).status_code == 201
        client.cookies.clear()
        r = _login(client)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True, "username": "owner", "role": "owner"}
        assert "vesmaro_auth=" in r.headers.get("set-cookie", "")

    def test_unknown_user_401_neutral(self, client):
        assert _register(client).status_code == 201
        r = _login(client, "ghost")
        assert r.status_code == 401
        assert r.json()["detail"] == "invalid username or password"

    def test_wrong_password_401_same_detail(self, client):
        assert _register(client).status_code == 201
        r = _login(client, password="totally-wrong-pass")
        assert r.status_code == 401
        assert r.json()["detail"] == "invalid username or password"

    def test_username_case_insensitive_lowercased(self, client):
        assert _register(client).status_code == 201
        r = _login(client, "OWNER")
        assert r.status_code == 200
        assert r.json()["username"] == "owner"

    def test_unknown_user_burns_the_equalizer(self, client, app_module,
                                              monkeypatch):
        """Timing-equalization contract: the unknown-username path runs the
        SAME scrypt verify work as the known-user path (one call on both
        routes to the 401) — response time cannot enumerate usernames."""
        calls = []
        real = app_module.verify_password

        def counting(password, encoded):
            calls.append(1)
            return real(password, encoded)

        monkeypatch.setattr(app_module, "verify_password", counting)
        assert _register(client).status_code == 201
        calls.clear()
        assert _login(client, "ghost").status_code == 401
        assert len(calls) == 1, "unknown-user login must burn the dummy scrypt"
        calls.clear()
        assert _login(client, password="wrong-pass-123").status_code == 401
        assert len(calls) == 1, "known-user login must run exactly one verify"

    @pytest.mark.parametrize("body", [
        {"username": "", "password": PASSWORD},
        {"username": "x" * 33, "password": PASSWORD},
        {"username": "owner", "password": ""},
        {"username": "owner", "password": "x" * 513},
        {"username": "owner", "password": PASSWORD, "extra": 1},
    ])
    def test_422_bounds(self, client, body):
        assert client.post("/api/auth/login", json=body).status_code == 422

    def test_429_after_per_ip_exhaustion(self, client):
        assert _register(client).status_code == 201
        for _ in range(10):
            assert _login(client, password="wrong-pass-123").status_code == 401
        r = _login(client)
        assert r.status_code == 429
        assert "per client" in r.json()["detail"]

    def test_429_global_budget(self, client, app_module, monkeypatch):
        assert _register(client).status_code == 201
        monkeypatch.setattr(
            app_module, "_auth_login_global_limiter", RateLimiter(2, 60.0))
        assert _login(client, password="wrong-pass-123").status_code == 401
        assert _login(client, password="wrong-pass-123").status_code == 401
        r = _login(client)
        assert r.status_code == 429
        assert "board-wide" in r.json()["detail"]

    def test_password_never_logged(self, client, caplog):
        marker = "qa-password-never-log-0f31c7"
        with caplog.at_level("DEBUG"):
            assert _register(client).status_code == 201
            client.cookies.clear()
            rejected = _login(client, password=marker)
            accepted = _login(client)
        assert rejected.status_code == 401
        assert accepted.status_code == 200
        assert marker not in caplog.text
        assert marker not in rejected.text and marker not in accepted.text
        assert PASSWORD not in caplog.text


# -------------------------------------------------------------------- logout
class TestLogout:
    def test_logout_204_clears_cookie(self, client):
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        r = client.post("/api/auth/logout")
        assert r.status_code == 204
        assert "max-age=0" in r.headers.get("set-cookie", "").lower()

    def test_logout_revokes_server_side(self, client):
        """The stolen-cookie replay: the DB row is gone, so re-setting the
        exact cookie value the login issued still answers 401 — revocation
        the stateless vesmaro_ui cookie cannot do."""
        assert _register(client).status_code == 201
        login = _login(client)
        assert login.status_code == 200
        token = _auth_cookie(login)
        assert client.post("/api/auth/logout").status_code == 204
        client.cookies.set("vesmaro_auth", token)
        assert _make_task(client, "replay").status_code == 401
        assert client.get("/api/auth/me").json() == {
            "authenticated": False, "username": None, "role": None}

    def test_logout_idempotent_without_cookie(self, client):
        assert client.post("/api/auth/logout").status_code == 204

    def test_logout_leaves_vesmaro_ui_alone(self, client, split_tokens):
        """The ADR 0014 session is a DIFFERENT cookie: logging out of the
        password session must not kill a live ui-token session."""
        assert client.post("/api/auth/ui-token",
                           json={"token": UI_TOKEN}).status_code == 200
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        assert client.post("/api/auth/logout").status_code == 204
        assert _make_task(client, "ui-still-live").status_code == 201


# ----------------------------------------------------------------------- me
class TestMe:
    def test_anonymous_false(self, client):
        r = client.get("/api/auth/me")
        assert r.status_code == 200
        assert r.json() == {"authenticated": False, "username": None,
                            "role": None}

    def test_live_session_names_the_account(self, client):
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        r = client.get("/api/auth/me")
        assert r.status_code == 200
        assert r.json() == {"authenticated": True, "username": "owner",
                            "role": "owner"}

    def test_me_is_a_read_only_oracle(self, client):
        """A whoami is not activity: no Set-Cookie, no sliding."""
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        r = client.get("/api/auth/me")
        assert "set-cookie" not in r.headers


# ------------------------------------------- the session leg inside guards
class TestSessionGuardLeg:
    """Same admission class as the ui token (design §4.1): ui mutations and
    ui-gated reads open, machine routes never, header determinism intact."""

    def test_ui_mutation_cookie_only_201(self, client):
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        assert _make_task(client, "pw-task").status_code == 201

    def test_machine_route_401(self, client):
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        r = client.post("/api/assignments/99999/claim",
                        json={"claimed_by": "pw-ghost"})
        assert r.status_code == 401
        assert r.json()["detail"] == "board write token required"

    def test_valid_header_passes_and_does_not_slide(self, client):
        """Header present → header leg ONLY (ADR 0014 determinism): a valid
        ui bearer mutates, but the password session gets no reissue (the
        set-cookie on the response is the vesmaro_ui sliding leg, not
        vesmaro_auth)."""
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        r = client.post("/api/tasks", json={"title": "hdr-leg"},
                        headers={"Authorization": f"Bearer {BOARD_TOKEN}"})
        assert r.status_code == 201
        assert "vesmaro_auth" not in r.headers.get("set-cookie", "")

    def test_wrong_header_plus_live_session_401(self, client, split_tokens):
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        r = client.post("/api/tasks", json={"title": "det"},
                        headers={"Authorization": f"Bearer {BOARD_TOKEN}"})
        assert r.status_code == 401
        detail = r.json()["detail"]
        assert "machine-class token" in detail
        assert "VESMARO_UI_TOKEN" in detail

    def test_reports_leg_pick_cookie_only(self, client, fresh_report_limiter):
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        task = _make_task(client, "pw-reports").json()
        r = client.post(f"/api/tasks/{task['id']}/reports",
                        json={"body": "from the owner", "kind": "intermediate",
                              "agent": "owner"})
        assert r.status_code == 201, r.text

    def test_task_session_facts_read(self, client, ui_auth):
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        task = _make_task(client, "pw-facts").json()
        r = client.get(f"/api/tasks/{task['id']}/sessions")
        assert r.status_code == 200, r.text

    def test_kora_sessions_read(self, client):
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        assert client.get("/api/kora/sessions").status_code == 200

    def test_actor_attribution_visible(self, client, make_task, ui_auth):
        """_leg_is_authenticated: a password session is an authenticated
        person — the actor strip on task events must project, not strip."""
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        task = make_task()
        r = client.get(f"/api/tasks/{task['id']}/history")
        assert r.status_code == 200
        events = r.json().get("events", [])
        assert events, "task creation event must exist"
        assert all("actor" in e for e in events if e.get("kind") == "task.created")

    def test_device_bearer_classified_before_any_cookie(self, client,
                                                        ui_auth):
        """mnd_ priority (ADR 0012 Amendment): the scope middleware 403s
        the agent loop BEFORE any leg — a live password cookie in the jar
        cannot lend the device rights its scope does not hold (mirror of
        test_device_token_plus_cookie_on_closed_mutation_403)."""
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        p = client.post("/api/pairing",
                        json={"device_name": "pw-mnd"}).json()
        client.post("/api/pairing/exchange",
                    json={"code": p["code"], "device_name": "pw-mnd"})
        client.post(f"/api/pairing/{p['pairing_id']}/confirm",
                    json={"allow": True})
        issued = client.post("/api/pairing/exchange",
                             json={"code": p["code"],
                                   "device_name": "pw-mnd"})
        mnd = issued.json()["device_token"]
        r = client.post("/api/assignments", json={},
                        headers={"Authorization": f"Bearer {mnd}"})
        assert r.status_code == 403
        device_id = issued.json()["device_id"]
        assert client.delete(
            f"/api/devices/{device_id}",
            headers={"Authorization": f"Bearer {BOARD_TOKEN}"}).status_code == 200

    def test_legacy_ui_token_path_untouched(self, client, split_tokens):
        """Regression guard: paste-the-token login (ADR 0014) keeps working
        byte-for-byte beside the new surface — even with BOTH cookies in
        the jar."""
        assert client.post("/api/auth/ui-token",
                           json={"token": UI_TOKEN}).status_code == 200
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        assert _make_task(client, "both-cookies").status_code == 201

    def test_fail_closed_503_preserved(self, client, no_board_token):
        """Accounts do NOT bypass the board fail-closed: no token class
        configured → ui mutations answer 503 even with a live session."""
        assert _register(client).status_code == 201
        assert _make_task(client, "closed").status_code == 503


# --------------------------------------------------------- sliding idle TTL
class TestSlidingReissue:
    def test_cookie_mutation_reissues_with_fresh_max_age(self, client):
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        r = _make_task(client, "slide-1")
        assert r.status_code == 201
        header = r.headers.get("set-cookie", "").lower()
        assert "vesmaro_auth=" in header
        assert "max-age=21600" in header

    def test_reissue_throttled_to_one_per_5min(self, client):
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        first = _make_task(client, "slide-2a")
        second = _make_task(client, "slide-2b")
        assert first.status_code == second.status_code == 201
        assert "set-cookie" in first.headers
        assert "set-cookie" not in second.headers

    def test_db_expiry_slides_with_the_cookie(self, client, app_module):
        assert _register(client).status_code == 201
        login = _login(client)
        assert login.status_code == 200
        token = _auth_cookie(login)
        before = app_module.store.get_auth_session(token)["expires_at"]
        mutation = _make_task(client, "slide-3")
        assert mutation.status_code == 201
        assert "set-cookie" in mutation.headers, "the cookie must reissue"
        after = app_module.store.get_auth_session(token)["expires_at"]
        assert after >= before, "the DB clock must slide with the cookie"

    def test_failed_request_spends_nothing(self, client):
        """P3 shape (inherited from the vesmaro_ui wrapper): a request that
        fails AFTER the guard must not extend the session — observable as
        no Set-Cookie on the 422."""
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        r = client.post("/api/tasks", json={"title": ""})
        assert r.status_code == 422
        assert "set-cookie" not in r.headers


# ------------------------------------------------------------------ hashing
class TestPasswordHashing:
    def test_envelope_format_and_params_roundtrip(self):
        encoded = hash_password("correct horse battery staple")
        algo, n, r, p, salt_hex, key_hex = encoded.split("$")
        assert algo == "scrypt"
        assert int(n) == 2 ** 15 and int(r) == 8 and int(p) == 1
        assert len(bytes.fromhex(salt_hex)) == 16
        assert len(bytes.fromhex(key_hex)) == 32

    def test_verify_roundtrip_and_rejects(self):
        encoded = hash_password("correct horse battery staple")
        assert verify_password("correct horse battery staple", encoded)
        assert not verify_password("correct horse battery staplE", encoded)

    def test_unique_salts_same_password(self):
        a = hash_password("same")
        b = hash_password("same")
        assert a != b

    @pytest.mark.parametrize("encoded", [
        "",                                          # empty
        "nonsense",                                  # no envelope
        "argon2id$19$2$1$ab$cd",                     # unknown algo
        "scrypt$1$8$1$ab$cd",                        # n below the sanity floor
        "scrypt$32768$8$1$zz$cd",                    # hex garbage
        "scrypt$32768$8$1$ab",                       # truncated
        None,                                        # not a string
    ])
    def test_malformed_envelopes_verify_false_never_raise(self, encoded):
        assert verify_password("x", encoded) is False

    def test_older_cost_hash_still_verifies(self):
        """Parameters ride the envelope: a hash minted under a lower cost
        (an ops cost-bump scenario in reverse) keeps verifying."""
        old = hash_password("legacy-cost", n=2 ** 10, r=8, p=1)
        assert verify_password("legacy-cost", old)
        algo, n, _r, _p, _s, _k = old.split("$")
        assert int(n) == 2 ** 10


# ------------------------------------------------------------------- CSRF
class TestCookieSurface:
    def test_cookie_flags_login_and_register(self, client):
        for opener in (_register(client), _login(client)):
            header = opener.headers.get("set-cookie", "").lower()
            assert "httponly" in header
            assert "samesite=strict" in header

    def test_auth_surface_is_post_only(self, client):
        """The state-changing surface accepts POST only — a GET on the
        mutating endpoints must never register or sign in anything (405,
        or the SPA history-fallback's 404 — either way, never a 2xx)."""
        assert client.get("/api/auth/register").status_code in (404, 405)
        assert client.get("/api/auth/login").status_code in (404, 405)


# ------------------------------------------------------- store-level units
class TestAccountStore:
    """The non-API paths' backstops: case-insensitive uniqueness and the
    in-transaction owner derivation (two concurrent first-registrations
    can never mint two owners)."""

    def test_nocase_uniqueness_backstop(self, app_module):
        store = app_module.store
        store.create_account("owner", "scrypt$32768$8$1$ab$cd")
        from server.store import AccountExistsError
        with pytest.raises(AccountExistsError):
            store.create_account("OWNER", "scrypt$32768$8$1$ab$cd")

    def test_role_derivation_in_transaction(self, app_module):
        store = app_module.store
        assert store.create_account("first", "h")["role"] == "owner"
        assert store.create_account("second", "h")["role"] == "member"

    def test_get_auth_session_expiry_read_as_none(self, app_module):
        """A session one second past its expiry validates to None — the
        sliding clock is enforced server-side, not only by cookie Max-Age."""
        from datetime import datetime, timedelta, timezone
        import time as _time
        store = app_module.store
        account = store.create_account("expiring", "h")
        token = "expiring-session-token"
        store.create_auth_session(token, account["id"], ttl_s=1.0)
        assert store.get_auth_session(token) is not None
        with store._lock, store._conn() as db:
            past = (datetime.now(timezone.utc)
                    - timedelta(seconds=1)).isoformat(timespec="seconds")
            db.execute("UPDATE auth_sessions SET expires_at=?",
                       (past,))
        assert store.get_auth_session(token) is None
        _time.sleep(0)


# ------------------------------------------------- cascade fixes (2026-10-01)
class TestValidationBodyHygiene:
    """Cascade F1 (CWE-209): the default 422 echoed each rejected field's
    VALUE (pydantic errors[].input) — the password rode the response body
    on exactly the validation path. The GLOBAL handler strips `input`;
    type/loc/msg survive (the error stays fixable)."""

    def test_register_422_never_echoes_password(self, client):
        marker = "p" * 513  # max_length violation → input was echoed
        r = client.post("/api/auth/register",
                        json={"username": "okname", "password": marker})
        assert r.status_code == 422
        assert marker not in r.text
        detail = r.json()["detail"]
        assert isinstance(detail, list) and detail
        assert all("input" not in entry for entry in detail)
        password_entry = next(e for e in detail if e["loc"][-1] == "password")
        assert password_entry["type"]        # string_too_long etc.
        assert password_entry["msg"]

    def test_login_422_never_echoes_password(self, client):
        marker = "q" * 513
        r = client.post("/api/auth/login",
                        json={"username": "owner", "password": marker})
        assert r.status_code == 422
        assert marker not in r.text
        assert all("input" not in entry
                   for entry in r.json()["detail"])

    def test_422_still_reports_the_field(self, client):
        """Hygiene must not blind the client: loc/type survive."""
        r = client.post("/api/auth/register",
                        json={"username": "ab", "password": PASSWORD})
        assert r.status_code == 422
        detail = r.json()["detail"]
        assert any(e["loc"][-1] == "username" for e in detail)


class TestFailedLoginAudit:
    """Cascade F2: the flat limiter is the only brute-force barrier, so
    every credential rejection leaves a PERSISTENT server_log trail —
    username + IP, never the password, same event for unknown-user and
    wrong-password. Deliberately NOT on the open SSE bus."""

    def _auth_log(self, app_module):
        with app_module.store._lock, app_module.store._conn() as db:
            rows = db.execute(
                "SELECT ts, server, action, detail FROM server_log "
                "WHERE server='auth' ORDER BY id DESC").fetchall()
        return [dict(r) for r in rows]

    def test_wrong_password_audited(self, client, app_module):
        assert _register(client).status_code == 201
        assert _login(client, password="wrong-pass-123").status_code == 401
        failed = [r for r in self._auth_log(app_module)
                  if r["action"] == "login.failed"]
        assert len(failed) == 1
        assert "wrong-pass-123" not in failed[0]["detail"]
        assert PASSWORD not in failed[0]["detail"]

    def test_unknown_user_audited_same_shape(self, client, app_module):
        assert _register(client).status_code == 201
        assert _login(client, "ghost").status_code == 401
        failed = [r for r in self._auth_log(app_module)
                  if r["action"] == "login.failed"]
        assert len(failed) == 1
        payload = json.loads(failed[0]["detail"])
        assert payload == {"username": "ghost", "ip": "testclient"}

    def test_successful_login_writes_no_failure(self, client, app_module):
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        assert [r for r in self._auth_log(app_module)
                if r["action"] == "login.failed"] == []

    def test_auth_events_never_reach_the_sse_bus(self, client, app_module):
        """register/login audits live in server_log ONLY: /api/events is an
        open anonymous feed and must never broadcast account activity."""
        assert _register(client).status_code == 201
        client.cookies.clear()
        assert _login(client).status_code == 200
        kinds = {e["kind"] for e in app_module.store.events(0, 10000)}
        assert "account.registered" not in kinds
        assert "auth.session.created" not in kinds
        # the persistent audit still carries them
        actions = {r["action"] for r in self._auth_log(app_module)}
        assert {"account.registered", "auth.session.created"} <= actions


class TestLogoutClearCookieSymmetry:
    """Cascade F5: the clear-cookie mirrors the set-cookie flags including
    Secure-by-scheme (an https deploy must not get an insecure clear)."""

    def test_https_logout_clears_with_secure(self, app_module):
        https = TestClient(app_module.app, base_url="https://testserver")
        assert _register(https).status_code == 201
        r = https.post("/api/auth/logout")
        assert r.status_code == 204
        header = r.headers.get("set-cookie", "").lower()
        assert "max-age=0" in header
        assert "secure" in header

    def test_http_logout_stays_insecure(self, client):
        assert _register(client).status_code == 201
        header = client.post("/api/auth/logout").headers.get(
            "set-cookie", "").lower()
        assert "max-age=0" in header
        assert "secure" not in header
