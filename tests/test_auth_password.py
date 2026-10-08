"""ME-080 follow-up: POST /api/auth/password — the password change /
owner recovery surface (the recovery gap: an account whose password is
lost had NO reset path; the owner was locked out with the ui-token leg
fully alive).

Pinned contract (server docstring is the normative text):
- leg (1), ``vesmaro_auth`` session: changes the session's OWN account;
  ``current_password`` REQUIRED, verified FIRST, ALWAYS exactly one
  scrypt verify per credential-bearing outcome (the login's
  dummy-equalizer discipline); foreign username → 403 AFTER the
  credential check; deterministic order: 422 shape → 401 credential →
  403 authorization;
- leg (2), ``vesmaro_ui`` cookie/Bearer (owner plumbing): recovery —
  sets a NEW password on a role=owner account WITHOUT the current one
  (own account included); the role gate is EXISTENCE-NEUTRAL — missing
  and non-owner names carry the SAME 403; header present → header leg
  ONLY (ADR 0014 Ф2);
- errors: 401 anonymous/wrong-current/non-ui bearer; 403 neutral; 422
  bounds + leg-shape; 429 flat per-IP 10/60s + global 60/60s with
  Retry-After;
- audit: server_log ONLY (never the open SSE bus) — auth.password.changed
  / auth.password.recovery with username+IP, auth.password.failed for a
  wrong current password (cascade F2); no password value in any log or
  response; 204 bare body; existing sessions are NOT revoked.
"""

from __future__ import annotations

import json

import pytest
from conftest import BOARD_TOKEN, UI_TOKEN
from fastapi.testclient import TestClient
from server.security import RateLimiter

PASSWORD = "parol-12345678"
NEW_PASSWORD = "parol-new-9931"
MEMBER_PASSWORD = "parol-member-1"
REFUSED_DETAIL = "password change refused for this username"


# ------------------------------------------------------------------ helpers
@pytest.fixture(autouse=True)
def fresh_password_state(app_module, monkeypatch, client):
    """The fresh_accounts_state contour (tests/test_auth_accounts.py) plus
    THIS endpoint's two limiters: empty accounts table, isolated
    limiters/reissue table per test, cookies wiped before AND after,
    VESMARO_ALLOW_REGISTRATION pinned OUT, scrypt on the low-cost
    profile (verify reads params from the envelope)."""
    from server import security

    monkeypatch.delenv("VESMARO_ALLOW_REGISTRATION", raising=False)
    monkeypatch.setattr(
        app_module, "hash_password",
        lambda pw: security.hash_password(pw, n=2 ** 12, r=8, p=1))
    for name in ("_auth_login_ip_limiter", "_auth_login_global_limiter",
                 "_auth_register_ip_limiter",
                 "_auth_register_global_limiter",
                 "_auth_password_ip_limiter",
                 "_auth_password_global_limiter"):
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


def _change(client: TestClient, **body):
    return client.post("/api/auth/password", json=body)


def _ui_login(client: TestClient, app_module) -> object:
    """The owner ui-token login: sets the ``vesmaro_ui`` cookie (the
    recovery leg's admission). Uses the CURRENTLY effective ui token —
    transition env falls back to the board token."""
    effective = app_module.UI_WRITE_TOKEN or app_module.BOARD_WRITE_TOKEN
    return client.post("/api/auth/ui-token", json={"token": effective})


def _auth_log(app_module) -> list[dict]:
    with app_module.store._lock, app_module.store._conn() as db:
        rows = db.execute(
            "SELECT ts, server, action, detail FROM server_log "
            "WHERE server='auth' ORDER BY id DESC").fetchall()
    return [dict(r) for r in rows]


# --------------------------------------------------------- leg 1: own change
class TestOwnPasswordLeg:
    def test_change_204_relogin_flips(self, client):
        assert _register(client).status_code == 201
        r = _change(client, new_password=NEW_PASSWORD,
                    current_password=PASSWORD)
        assert r.status_code == 204, r.text
        assert r.content == b""  # bare 204 — the FE dialog keys on it
        assert _login(client, password=PASSWORD).status_code == 401
        assert _login(client, password=NEW_PASSWORD).status_code == 200

    def test_explicit_self_username_accepted(self, client):
        assert _register(client).status_code == 201
        r = _change(client, username="owner", new_password=NEW_PASSWORD,
                    current_password=PASSWORD)
        assert r.status_code == 204, r.text
        assert _login(client, password=NEW_PASSWORD).status_code == 200

    def test_change_keeps_the_callers_session(self, client):
        """Pinned decision: a change does NOT sweep sessions (no
        revocation in this slice) — the caller's own cookie stays live."""
        assert _register(client).status_code == 201
        assert _change(client, new_password=NEW_PASSWORD,
                       current_password=PASSWORD).status_code == 204
        me = client.get("/api/auth/me").json()
        assert me == {"authenticated": True, "username": "owner",
                      "role": "owner"}

    def test_wrong_current_401_password_unchanged(self, client):
        assert _register(client).status_code == 201
        r = _change(client, new_password=NEW_PASSWORD,
                    current_password="totally-wrong-pass")
        assert r.status_code == 401
        assert r.json()["detail"] == "current password is incorrect"
        assert _login(client, password=PASSWORD).status_code == 200, \
            "a rejected change must not touch the stored hash"

    def test_foreign_target_403_neutral(self, client):
        assert _register(client).status_code == 201
        r = _change(client, username="someone-else",
                    new_password=NEW_PASSWORD, current_password=PASSWORD)
        assert r.status_code == 403
        assert r.json()["detail"] == REFUSED_DETAIL

    def test_wrong_current_beats_foreign_target(self, client):
        """Deterministic check order: request shape 422 → credential 401 →
        authorization 403. A wrong current password answers 401 even when
        the named target is foreign."""
        assert _register(client).status_code == 201
        r = _change(client, username="ghost", new_password=NEW_PASSWORD,
                    current_password="totally-wrong-pass")
        assert r.status_code == 401
        assert r.json()["detail"] == "current password is incorrect"

    def test_missing_current_422(self, client):
        assert _register(client).status_code == 201
        r = _change(client, new_password=NEW_PASSWORD)
        assert r.status_code == 422
        assert "current_password" in r.json()["detail"]

    def test_equalizer_one_verify_per_credential_outcome(self, client,
                                                         app_module,
                                                         monkeypatch):
        """The login's timing-equalization discipline carried over: every
        credential-bearing outcome burns EXACTLY one scrypt verify (the
        caller's own hash), so a foreign target is time-indistinguishable
        from the self one. The shape 422 (no credential to verify) burns
        zero."""
        calls = []
        real = app_module.verify_password

        def counting(password, encoded):
            calls.append(1)
            return real(password, encoded)

        monkeypatch.setattr(app_module, "verify_password", counting)
        assert _register(client).status_code == 201
        calls.clear()
        assert _change(client, new_password=NEW_PASSWORD,
                       current_password="totally-wrong-pass").status_code \
            == 401
        assert len(calls) == 1, "wrong current must run exactly one verify"
        calls.clear()
        assert _change(client, username="someone-else",
                       new_password=NEW_PASSWORD,
                       current_password=PASSWORD).status_code == 403
        assert len(calls) == 1, "foreign target burns the SAME one verify"
        calls.clear()
        assert _change(client, new_password=NEW_PASSWORD,
                       current_password=PASSWORD).status_code == 204
        assert len(calls) == 1, "success burns exactly one verify"
        calls.clear()
        assert _change(client, username="someone-else",
                       new_password=NEW_PASSWORD).status_code == 422
        assert len(calls) == 0, "no credential offered — nothing to verify"

    @pytest.mark.parametrize("body", [
        {"new_password": ""},
        {"new_password": "x" * 7},
        {"new_password": "x" * 513},
        {"new_password": NEW_PASSWORD, "current_password": ""},
        {"new_password": NEW_PASSWORD, "username": ""},
        {"new_password": NEW_PASSWORD, "username": "x" * 33},
        {"new_password": NEW_PASSWORD, "current_password": PASSWORD,
         "extra": 1},
    ])
    def test_422_bounds(self, client, body):
        assert client.post("/api/auth/password", json=body).status_code == 422

    def test_422_never_echoes_password(self, client):
        marker = "qa-pw-422-marker-77b1c"
        r = client.post("/api/auth/password",
                        json={"new_password": "x" * 513,
                              "current_password": marker})
        assert r.status_code == 422
        assert marker not in r.text
        assert "x" * 513 not in r.text

    def test_429_after_per_ip_exhaustion(self, client, app_module,
                                         monkeypatch):
        monkeypatch.setattr(
            app_module, "_auth_password_ip_limiter", RateLimiter(1, 60.0))
        assert _register(client).status_code == 201
        assert _change(client, new_password=NEW_PASSWORD,
                       current_password=PASSWORD).status_code == 204
        r = _change(client, new_password=NEW_PASSWORD,
                    current_password=PASSWORD)
        assert r.status_code == 429
        assert "per client" in r.json()["detail"]
        assert int(r.headers["Retry-After"]) >= 1

    def test_429_global_budget(self, client, app_module, monkeypatch):
        assert _register(client).status_code == 201
        monkeypatch.setattr(
            app_module, "_auth_password_global_limiter", RateLimiter(2, 60.0))
        assert _change(client, new_password=NEW_PASSWORD,
                       current_password="totally-wrong-pass").status_code \
            == 401
        assert _change(client, new_password=NEW_PASSWORD,
                       current_password="totally-wrong-pass").status_code \
            == 401
        r = _change(client, new_password=NEW_PASSWORD,
                    current_password=PASSWORD)
        assert r.status_code == 429
        assert "board-wide" in r.json()["detail"]
        assert int(r.headers["Retry-After"]) >= 1

    def test_password_never_logged(self, client, caplog):
        marker = "qa-pw-never-log-0f31c7"
        with caplog.at_level("DEBUG"):
            assert _register(client).status_code == 201
            rejected = _change(client, new_password=NEW_PASSWORD,
                               current_password=marker)
            accepted = _change(client, new_password=NEW_PASSWORD,
                               current_password=PASSWORD)
        assert rejected.status_code == 401
        assert accepted.status_code == 204
        assert marker not in caplog.text
        assert NEW_PASSWORD not in caplog.text
        assert marker not in rejected.text
        assert NEW_PASSWORD not in accepted.text


# ------------------------------------------------------- leg 2: owner recovery
class TestRecoveryLeg:
    def test_recovery_resets_owner_without_current(self, client, app_module):
        """The locked-out owner path: a live vesmaro_ui cookie resets the
        owner account's password with NO current password (the ui token
        IS the proof)."""
        assert _register(client).status_code == 201
        assert _ui_login(client, app_module).status_code == 200
        r = _change(client, username="owner", new_password=NEW_PASSWORD)
        assert r.status_code == 204, r.text
        assert r.content == b""
        assert _login(client, password=PASSWORD).status_code == 401
        assert _login(client, password=NEW_PASSWORD).status_code == 200

    def test_recovery_via_bearer_header(self, client, app_module,
                                        monkeypatch):
        """Header leg (ADR 0014 Ф2): split mode, the ui bearer opens the
        same recovery without any cookie."""
        monkeypatch.setattr(app_module, "UI_WRITE_TOKEN", UI_TOKEN)
        assert _register(client).status_code == 201
        r = client.post("/api/auth/password",
                        headers={"Authorization": f"Bearer {UI_TOKEN}"},
                        json={"username": "owner",
                              "new_password": NEW_PASSWORD})
        assert r.status_code == 204, r.text
        assert _login(client, password=NEW_PASSWORD).status_code == 200

    def test_recovery_ignores_a_supplied_current_password(self, client,
                                                          app_module):
        assert _register(client).status_code == 201
        assert _ui_login(client, app_module).status_code == 200
        r = _change(client, username="owner", new_password=NEW_PASSWORD,
                    current_password="irrelevant-pass")
        assert r.status_code == 204, r.text

    def test_non_owner_target_403_and_unchanged(self, client, app_module,
                                                monkeypatch):
        """The role gate: recovery resets role=owner accounts ONLY — a
        member's password cannot be set over their head without their
        current password."""
        assert _register(client).status_code == 201
        monkeypatch.setenv("VESMARO_ALLOW_REGISTRATION", "1")
        assert _register(client, "member1", MEMBER_PASSWORD).status_code \
            == 201
        assert _ui_login(client, app_module).status_code == 200
        r = _change(client, username="member1", new_password=NEW_PASSWORD)
        assert r.status_code == 403
        assert r.json()["detail"] == REFUSED_DETAIL
        client.cookies.clear()
        assert _login(client, "member1",
                      password=MEMBER_PASSWORD).status_code == 200, \
            "a refused recovery must not touch the member hash"

    def test_unknown_target_403_identical_to_non_owner(self, client,
                                                       app_module,
                                                       monkeypatch):
        """Existence neutrality: a MISSING name and a non-owner name land
        on the SAME status AND detail — the 404 oracle is designed out."""
        assert _register(client).status_code == 201
        monkeypatch.setenv("VESMARO_ALLOW_REGISTRATION", "1")
        assert _register(client, "member1", MEMBER_PASSWORD).status_code \
            == 201
        assert _ui_login(client, app_module).status_code == 200
        member = _change(client, username="member1",
                         new_password=NEW_PASSWORD)
        ghost = _change(client, username="ghost", new_password=NEW_PASSWORD)
        assert member.status_code == ghost.status_code == 403
        assert member.json()["detail"] == ghost.json()["detail"] \
            == REFUSED_DETAIL

    def test_missing_username_422(self, client, app_module):
        """The ui token carries no account identity — the recovery leg
        must be TOLD whom to reset (no implicit target)."""
        assert _register(client).status_code == 201
        assert _ui_login(client, app_module).status_code == 200
        r = _change(client, new_password=NEW_PASSWORD)
        assert r.status_code == 422
        assert "username" in r.json()["detail"]

    def test_header_leg_only_non_ui_bearer_401(self, client, app_module,
                                               monkeypatch):
        """ADR 0014 Ф2 determinism: a header present → the header leg
        ONLY. In split mode a machine-class bearer is a 401 with the
        cross-class detail even beside a LIVE password session — and the
        password is NOT changed via the cookie fallback."""
        monkeypatch.setattr(app_module, "UI_WRITE_TOKEN", UI_TOKEN)
        assert _register(client).status_code == 201
        assert _login(client).status_code == 200
        r = client.post("/api/auth/password",
                        headers={"Authorization": f"Bearer {BOARD_TOKEN}"},
                        json={"username": "owner",
                              "new_password": NEW_PASSWORD})
        assert r.status_code == 401
        assert "machine-class" in r.json()["detail"]
        client.cookies.clear()
        assert _login(client, password=PASSWORD).status_code == 200, \
            "the cookie must not have been consulted"

    def test_anonymous_401(self, client):
        assert _register(client).status_code == 201
        client.cookies.clear()
        r = _change(client, username="owner", new_password=NEW_PASSWORD)
        assert r.status_code == 401
        assert "sign in" in r.json()["detail"]

    def test_429_recovery_rides_the_same_budget(self, client, app_module,
                                                monkeypatch):
        """ONE budget per endpoint: the recovery leg shares the
        own-password leg's limiter — no per-leg split doubling the
        guessing rate."""
        monkeypatch.setattr(
            app_module, "_auth_password_ip_limiter", RateLimiter(1, 60.0))
        assert _register(client).status_code == 201
        assert _ui_login(client, app_module).status_code == 200
        assert _change(client, username="owner",
                       new_password=NEW_PASSWORD).status_code == 204
        r = _change(client, username="owner", new_password=NEW_PASSWORD)
        assert r.status_code == 429
        assert int(r.headers["Retry-After"]) >= 1


# ------------------------------------------------------------------- audit
class TestAudit:
    def test_change_audited_username_ip_no_password(self, client,
                                                    app_module):
        assert _register(client).status_code == 201
        assert _change(client, new_password=NEW_PASSWORD,
                       current_password=PASSWORD).status_code == 204
        rows = [r for r in _auth_log(app_module)
                if r["action"] == "auth.password.changed"]
        assert len(rows) == 1
        payload = json.loads(rows[0]["detail"])
        assert payload == {"username": "owner", "ip": "testclient"}
        assert PASSWORD not in rows[0]["detail"]
        assert NEW_PASSWORD not in rows[0]["detail"]

    def test_recovery_audited_username_ip_no_password(self, client,
                                                      app_module):
        assert _register(client).status_code == 201
        assert _ui_login(client, app_module).status_code == 200
        assert _change(client, username="owner",
                       new_password=NEW_PASSWORD).status_code == 204
        rows = [r for r in _auth_log(app_module)
                if r["action"] == "auth.password.recovery"]
        assert len(rows) == 1
        payload = json.loads(rows[0]["detail"])
        assert payload == {"username": "owner", "ip": "testclient"}
        assert NEW_PASSWORD not in rows[0]["detail"]

    def test_wrong_current_audited_like_login(self, client, app_module):
        """Cascade F2: a wrong current password is a credential rejection
        on a credential surface — it leaves the persistent trail the flat
        limiter cannot provide."""
        assert _register(client).status_code == 201
        assert _change(client, new_password=NEW_PASSWORD,
                       current_password="totally-wrong-pass").status_code \
            == 401
        rows = [r for r in _auth_log(app_module)
                if r["action"] == "auth.password.failed"]
        assert len(rows) == 1
        payload = json.loads(rows[0]["detail"])
        assert payload == {"username": "owner", "ip": "testclient"}
        assert "totally-wrong-pass" not in rows[0]["detail"]
        assert PASSWORD not in rows[0]["detail"]
        assert NEW_PASSWORD not in rows[0]["detail"]

    def test_refused_target_writes_no_success_audit(self, client,
                                                    app_module):
        assert _register(client).status_code == 201
        assert _change(client, username="someone-else",
                       new_password=NEW_PASSWORD,
                       current_password=PASSWORD).status_code == 403
        actions = {r["action"] for r in _auth_log(app_module)}
        assert "auth.password.changed" not in actions
        assert "auth.password.recovery" not in actions

    def test_auth_actions_never_reach_the_sse_bus(self, client, app_module):
        assert _register(client).status_code == 201
        assert _change(client, new_password=NEW_PASSWORD,
                       current_password=PASSWORD).status_code == 204
        kinds = {e["kind"] for e in app_module.store.events(0, 10000)}
        assert "auth.password.changed" not in kinds
        assert "auth.password.recovery" not in kinds
        actions = {r["action"] for r in _auth_log(app_module)}
        assert "auth.password.changed" in actions
